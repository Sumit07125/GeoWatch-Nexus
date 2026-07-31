import torch
import torch.nn as nn

class ConvBlock(nn.Module):
    """(Conv2d -> BatchNorm2d -> ReLU) x 2"""

    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class AttentionGate(nn.Module):
    """
    g: gating signal from the decoder (coarser semantic features)
    x: skip connection from the encoder (finer spatial detail)
    Both must already be the same spatial size when this is called.
    """

    def __init__(self, f_g: int, f_l: int, f_int: int):
        super().__init__()
        self.W_g = nn.Sequential(
            nn.Conv2d(f_g, f_int, kernel_size=1, bias=True),
            nn.BatchNorm2d(f_int),
        )
        self.W_x = nn.Sequential(
            nn.Conv2d(f_l, f_int, kernel_size=1, bias=True),
            nn.BatchNorm2d(f_int),
        )
        self.psi = nn.Sequential(
            nn.Conv2d(f_int, 1, kernel_size=1, bias=True),
            nn.BatchNorm2d(1),
            nn.Sigmoid(),
        )
        self.relu = nn.ReLU(inplace=True)

    def forward(self, g: torch.Tensor, x: torch.Tensor) -> torch.Tensor:
        attn = self.relu(self.W_g(g) + self.W_x(x))
        attn = self.psi(attn)
        return x * attn


class SiameseAttentionUNet(nn.Module):
    """
    Input:  img1, img2 -> each (B, in_channels, H, W), H and W divisible by 16
    Output: logits      -> (B, 1, H, W)  (raw scores; apply sigmoid for probabilities)
    """

    def __init__(
        self,
        in_channels: int = 13,
        base_ch: int = 64,
        dropout_bottleneck: float = 0.2,
        dropout_decoder: float = 0.1,
    ):
        super().__init__()
        c1, c2, c3, c4, c5 = base_ch, base_ch * 2, base_ch * 4, base_ch * 8, base_ch * 16

        # --- shared encoder (run once per date) ---
        self.enc1 = ConvBlock(in_channels, c1)
        self.enc2 = ConvBlock(c1, c2)
        self.enc3 = ConvBlock(c2, c3)
        self.enc4 = ConvBlock(c3, c4)
        self.bottleneck = ConvBlock(c4, c5)
        self.pool = nn.MaxPool2d(2)

        self.drop_bottleneck = nn.Dropout2d(p=dropout_bottleneck)
        self.drop_decoder = nn.Dropout2d(p=dropout_decoder)

        # --- decoder ---
        self.up4 = nn.ConvTranspose2d(c5, c4, kernel_size=2, stride=2)
        self.att4 = AttentionGate(c4, c4, c4 // 2)
        self.dec4 = ConvBlock(c5, c4)

        self.up3 = nn.ConvTranspose2d(c4, c3, kernel_size=2, stride=2)
        self.att3 = AttentionGate(c3, c3, c3 // 2)
        self.dec3 = ConvBlock(c4, c3)

        self.up2 = nn.ConvTranspose2d(c3, c2, kernel_size=2, stride=2)
        self.att2 = AttentionGate(c2, c2, c2 // 2)
        self.dec2 = ConvBlock(c3, c2)

        self.up1 = nn.ConvTranspose2d(c2, c1, kernel_size=2, stride=2)
        self.att1 = AttentionGate(c1, c1, c1 // 2)
        self.dec1 = ConvBlock(c2, c1)

        self.out_conv = nn.Conv2d(c1, 1, kernel_size=1)

    def _encode(self, x: torch.Tensor):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        e4 = self.enc4(self.pool(e3))
        b = self.bottleneck(self.pool(e4))
        b = self.drop_bottleneck(b)
        return e1, e2, e3, e4, b

    def forward(self, img1: torch.Tensor, img2: torch.Tensor) -> torch.Tensor:
        # 1. Feature Extraction via Shared Encoders
        e1_1, e2_1, e3_1, e4_1, b_1 = self._encode(img1)
        e1_2, e2_2, e3_2, e4_2, b_2 = self._encode(img2)

        # 2. Absolute Difference at every scale yields the "change signal"
        d1 = torch.abs(e1_1 - e1_2)
        d2 = torch.abs(e2_1 - e2_2)
        d3 = torch.abs(e3_1 - e3_2)
        d4 = torch.abs(e4_1 - e4_2)
        b = torch.abs(b_1 - b_2)

        # 3. Decoder with Attention Gates
        g4 = self.up4(b)
        att4 = self.att4(g=g4, x=d4)
        x4 = self.dec4(torch.cat([g4, att4], dim=1))
        x4 = self.drop_decoder(x4)

        g3 = self.up3(x4)
        att3 = self.att3(g=g3, x=d3)
        x3 = self.dec3(torch.cat([g3, att3], dim=1))
        x3 = self.drop_decoder(x3)

        g2 = self.up2(x3)
        att2 = self.att2(g=g2, x=d2)
        x2 = self.dec2(torch.cat([g2, att2], dim=1))
        x2 = self.drop_decoder(x2)

        g1 = self.up1(x2)
        att1 = self.att1(g=g1, x=d1)
        x1 = self.dec1(torch.cat([g1, att1], dim=1))
        x1 = self.drop_decoder(x1)

        return self.out_conv(x1)
