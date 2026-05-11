// Deploy AFTER Azure OpenAI access is approved (submit request at https://aka.ms/oai/access).
// Uncomment the module call in main.bicep once access is granted.

param location string
param accountName string

resource openaiAccount 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: accountName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: accountName
    publicNetworkAccess: 'Enabled'
  }
}

// GPT-4.1 for narrative generation (high quality, higher cost)
resource gpt41Deployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openaiAccount
  name: 'gpt-41'
  sku: {
    name: 'Standard'
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4.1'
      version: 'latest'
    }
  }
}

// GPT-4.1-mini for all other calls (RAG, state extraction, validation, summaries)
resource gpt41MiniDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openaiAccount
  name: 'gpt-41-mini'
  sku: {
    name: 'Standard'
    capacity: 20
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4.1-mini'
      version: 'latest'
    }
  }
  dependsOn: [gpt41Deployment]  // deployments must be sequential in the same account
}

// text-embedding-ada-002 for SRD vector indexing (1536 dimensions)
resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openaiAccount
  name: 'text-embedding-ada-002'
  sku: {
    name: 'Standard'
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'text-embedding-ada-002'
      version: '2'
    }
  }
  dependsOn: [gpt41MiniDeployment]
}

output endpoint string = openaiAccount.properties.endpoint
@secure()
output apiKey string = openaiAccount.listKeys().key1
