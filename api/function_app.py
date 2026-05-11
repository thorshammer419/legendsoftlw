import azure.functions as func
import azure.durable_functions as df

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)
df_app = df.DFApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# Individual function modules are registered below.
# Azure Functions v2 Python programming model uses decorators in each module;
# import them here so the decorators execute at startup.

from functions import webhook_http   # noqa: F401  HTTP trigger — player action intake
from functions import orchestrator   # noqa: F401  Durable orchestrator — round lifecycle
