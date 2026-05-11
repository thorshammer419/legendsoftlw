param location string
param signalrName string

// Free_F1: 20 concurrent connections. Upgrade to Standard_S1 when > 20 players.
@allowed(['Free_F1', 'Standard_S1'])
param sku string = 'Free_F1'

resource signalr 'Microsoft.SignalRService/signalR@2023-02-01' = {
  name: signalrName
  location: location
  sku: {
    name: sku
    capacity: 1
  }
  kind: 'SignalR'
  properties: {
    features: [
      {
        flag: 'ServiceMode'
        value: 'Serverless'
      }
    ]
    cors: {
      allowedOrigins: ['*']
    }
  }
}

@secure()
output connectionString string = signalr.listKeys().primaryConnectionString
