"""HTTP trigger — receives player action submissions.

Returns 200 OK immediately, then signals the Durable orchestrator
so the round can proceed asynchronously.
"""
import azure.functions as func
import azure.durable_functions as df

# TODO: implement


async def main(req: func.HttpRequest, starter: str) -> func.HttpResponse:
    raise NotImplementedError
