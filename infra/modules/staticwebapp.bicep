// eastus2 is the recommended location for Static Web Apps.
param location string = 'eastus2'
param staticWebAppName string
param repositoryUrl string = ''
param branch string = 'main'

resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    repositoryUrl: repositoryUrl
    branch: branch
    buildProperties: {
      appLocation: '/web'
      apiLocation: ''           // API served by Azure Functions, not SWA managed functions
      outputLocation: 'build'
    }
  }
}

output defaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppId string = staticWebApp.id
