targetScope = 'resourceGroup'

@description('Azure region for all resources (except Static Web Apps which has limited regions).')
param location string = 'eastus'

@description('Base name used to derive all resource names. Keep short — storage accounts have a 24-char limit.')
@maxLength(16)
param appName string = 'legendsoftlw'

@description('Azure region for Static Web Apps (limited availability — eastus2 recommended).')
param staticWebAppLocation string = 'eastus2'

@description('Full GitHub HTTPS repo URL, e.g. https://github.com/org/repo. Leave empty to skip SWA GitHub integration.')
param githubRepoUrl string = ''

@description('Branch to deploy from.')
param githubBranch string = 'main'

@description('Azure AI Search SKU. Use "free" (50 MB limit) for current usage, "basic" (~$75/mo) if index grows beyond limit.')
@allowed(['free', 'basic'])
param searchSku string = 'free'

@description('SignalR SKU. Free_F1 supports 20 concurrent connections; upgrade to Standard_S1 for more.')
@allowed(['Free_F1', 'Standard_S1'])
param signalrSku string = 'Free_F1'

// ── Storage ───────────────────────────────────────────────────────────────────
// Must be created before Functions (Functions needs a storage account).
module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    storageAccountName: '${appName}storage'
  }
}

// ── Cosmos DB ─────────────────────────────────────────────────────────────────
module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos'
  params: {
    location: location
    accountName: '${appName}-cosmos'
  }
}

// ── Azure AI Search ───────────────────────────────────────────────────────────
module search 'modules/search.bicep' = {
  name: 'search'
  params: {
    location: location
    searchServiceName: '${appName}-search'
    sku: searchSku
  }
}

// ── SignalR ───────────────────────────────────────────────────────────────────
module signalr 'modules/signalr.bicep' = {
  name: 'signalr'
  params: {
    location: location
    signalrName: '${appName}-signalr'
    sku: signalrSku
  }
}

// ── Communication Services ────────────────────────────────────────────────────
module comms 'modules/comms.bicep' = {
  name: 'comms'
  params: {
    commsName: '${appName}-comms'
    dataLocation: 'unitedstates'
  }
}

// ── Azure Functions ───────────────────────────────────────────────────────────
// Creates the app with a system-assigned managed identity. Full app settings
// are wired up in the functionAppSettings resource below (after Key Vault exists).
module functions 'modules/functions.bicep' = {
  name: 'functions'
  params: {
    location: location
    functionAppName: '${appName}-functions'
    storageAccountName: storage.outputs.storageAccountName
  }
  dependsOn: [storage]
}

// ── Key Vault ─────────────────────────────────────────────────────────────────
// Grants the Functions App managed identity read access to secrets.
module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    vaultName: '${appName}-kv'
    functionAppPrincipalId: functions.outputs.principalId
    cosmosConnectionString: cosmos.outputs.connectionString
    searchApiKey: search.outputs.adminApiKey
    signalrConnectionString: signalr.outputs.connectionString
    storageConnectionString: storage.outputs.connectionString
    commsConnectionString: comms.outputs.connectionString
  }
  dependsOn: [functions, cosmos, search, signalr, storage, comms]
}

// ── Azure OpenAI ──────────────────────────────────────────────────────────────
// Uncomment after Azure OpenAI access is approved.
// Store the output API key in Key Vault manually:
//   az keyvault secret set --vault-name legendsoftlw-kv --name OPENAI-API-KEY --value <key>
//
// module openai 'modules/openai.bicep' = {
//   name: 'openai'
//   params: {
//     location: location
//     accountName: '${appName}-openai'
//   }
// }

// ── Static Web Apps ───────────────────────────────────────────────────────────
module staticwebapp 'modules/staticwebapp.bicep' = {
  name: 'staticwebapp'
  params: {
    location: staticWebAppLocation
    staticWebAppName: appName
    repositoryUrl: githubRepoUrl
    branch: githubBranch
  }
}

// ── Functions App Settings (Key Vault references) ─────────────────────────────
// Replaces the bootstrap settings set in functions.bicep with full KV-backed config.
// Uses Key Vault reference syntax: @Microsoft.KeyVault(VaultName=...;SecretName=...)
resource functionApp 'Microsoft.Web/sites@2023-01-01' existing = {
  name: '${appName}-functions'
  dependsOn: [functions]
}

resource functionAppSettings 'Microsoft.Web/sites/config@2023-01-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: {
    AzureWebJobsStorage: '@Microsoft.KeyVault(VaultName=${appName}-kv;SecretName=STORAGE-CONNECTION-STRING)'
    FUNCTIONS_WORKER_RUNTIME: 'python'
    FUNCTIONS_EXTENSION_VERSION: '~4'

    COSMOS_CONNECTION_STRING: '@Microsoft.KeyVault(VaultName=${appName}-kv;SecretName=COSMOS-CONNECTION-STRING)'
    COSMOS_DATABASE_NAME: 'legends-db'

    SEARCH_ENDPOINT: search.outputs.endpoint
    SEARCH_API_KEY: '@Microsoft.KeyVault(VaultName=${appName}-kv;SecretName=SEARCH-API-KEY)'
    SEARCH_INDEX_NAME: 'srd-index'

    SIGNALR_CONNECTION_STRING: '@Microsoft.KeyVault(VaultName=${appName}-kv;SecretName=SIGNALR-CONNECTION-STRING)'

    STORAGE_CONNECTION_STRING: '@Microsoft.KeyVault(VaultName=${appName}-kv;SecretName=STORAGE-CONNECTION-STRING)'

    COMMS_CONNECTION_STRING: '@Microsoft.KeyVault(VaultName=${appName}-kv;SecretName=COMMS-CONNECTION-STRING)'
    COMMS_SENDER_EMAIL: 'noreply@legendsoftlw.app'

    // Set after OpenAI access is approved:
    // OPENAI_ENDPOINT: 'https://${appName}-openai.openai.azure.com/'
    // OPENAI_API_KEY: '@Microsoft.KeyVault(VaultName=${appName}-kv;SecretName=OPENAI-API-KEY)'
    OPENAI_NARRATIVE_DEPLOYMENT: 'gpt-41'
    OPENAI_MINI_DEPLOYMENT: 'gpt-41-mini'
    OPENAI_EMBEDDING_DEPLOYMENT: 'text-embedding-ada-002'
  }
  dependsOn: [keyvault]
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output staticWebAppUrl string = 'https://${staticwebapp.outputs.defaultHostname}'
output functionAppUrl string = 'https://${functions.outputs.defaultHostname}'
output searchEndpoint string = search.outputs.endpoint
output cosmosEndpoint string = cosmos.outputs.endpoint
output keyVaultUri string = keyvault.outputs.vaultUri
