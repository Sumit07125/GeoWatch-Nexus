import datetime
from collections import deque

# Keep the last 100 domain logs
system_logs = deque(maxlen=100)

def add_log(message, type="info"):
    """
    Add a domain log to the in-memory queue.
    type options: 'info', 'fetch' (yellow), 'save' (green), 'compare' (blue), 'error' (red)
    """
    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    log_entry = {
        "timestamp": timestamp,
        "message": message,
        "type": type
    }
    system_logs.append(log_entry)
    print(f"[{type.upper()}] {timestamp} - {message}")

def get_logs():
    return list(system_logs)
