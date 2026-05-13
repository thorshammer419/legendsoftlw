param location string
param vaultName string
param functionAppPrincipalId string

@secure()
param cosmosConnectionString string
@secure()
param searchApiKey string
@secure()
param signalrConnectionString string
@secure()
param storageConnectionString string
@secure()
param commsConnectionString string

resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: vaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: false
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: functionAppPrincipalId
        permissions: {
          secrets: ['get', 'list']
        }
      }
    ]
  }
}

resource cosmosSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'COSMOS-CONNECTION-STRING'
  properties: { value: cosmosConnectionString }
}

resource searchSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'SEARCH-API-KEY'
  properties: { value: searchApiKey }
}

resource signalrSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'SIGNALR-CONNECTION-STRING'
  properties: { value: signalrConnectionString }
}

resource storageSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'STORAGE-CONNECTION-STRING'
  properties: { value: storageConnectionString }
}

resource commsSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'COMMS-CONNECTION-STRING'
  properties: { value: commsConnectionString }
}

// OpenAI key stored here after access is approved; set manually:
//   az keyvault secret set --vault-name <vaultName> --name OPENAI-API-KEY --value <key>

output vaultUri string = keyVault.properties.vaultUri
output vaultName string = keyVault.name
