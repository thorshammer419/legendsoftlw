param location string
param searchServiceName string

// Basic tier (~$75/month). Downgrade to 'free' for dev (50 MB limit, no SLA).
@allowed(['free', 'basic', 'standard', 'standard2', 'standard3'])
param sku string = 'basic'

resource searchService 'Microsoft.Search/searchServices@2023-11-01' = {
  name: searchServiceName
  location: location
  sku: {
    name: sku
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
  }
}

output endpoint string = 'https://${searchService.name}.search.windows.net'
@secure()
output adminApiKey string = searchService.listAdminKeys().primaryKey
