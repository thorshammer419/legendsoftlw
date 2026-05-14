import base64
import json
import os


def enqueue(queue_name: str, payload: dict) -> None:
    from azure.storage.queue import QueueClient
    conn_str = os.environ["AzureWebJobsStorage"]
    q = QueueClient.from_connection_string(conn_str, queue_name)
    try:
        q.create_queue()
    except Exception:
        pass
    q.send_message(base64.b64encode(json.dumps(payload).encode()).decode())
