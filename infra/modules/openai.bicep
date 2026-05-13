// Two OpenAI resources are required — image generation models are only available in East US 2.
// DALL-E 3 was deprecated March 2026; gpt-image-1 is the replacement.
//
// Text models (GPT-4.1, GPT-4.1-mini, text-embedding-ada-002):
//   Deploy to Central US (or any region with GPT-4.1 availability).
//   NOTE: the actual resource (oai-thorshammer419-centralus) is a pre-existing shared
//   resource in a different resource group — it is NOT managed by this Bicep module.
//
// Image model (gpt-image-1):
//   Managed by this module. Must be in East US 2 or Sweden Central.

param imageResourceLocation string = 'eastus2'
param imageAccountName string = 'tlw-openai-images'

resource imageAccount 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: imageAccountName
  location: imageResourceLocation
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: imageAccountName
    publicNetworkAccess: 'Enabled'
  }
}

// gpt-image-1: replaces DALL-E 3 (deprecated March 2026)
// Requires GlobalStandard SKU and API version 2025-04-01-preview
resource imageDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: imageAccount
  name: 'tlw-gpt-image-1'
  sku: {
    name: 'GlobalStandard'
    capacity: 1
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-image-1'
      version: '2025-04-15'
    }
  }
}

output imageEndpoint string = imageAccount.properties.endpoint
@secure()
output imageApiKey string = imageAccount.listKeys().key1
