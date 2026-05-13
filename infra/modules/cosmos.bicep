param location string
param accountName string

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    databaseAccountOfferType: 'Standard'
    enableFreeTier: false
    capabilities: [
      { name: 'EnableServerless' }
    ]
  }
}

resource legendsDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-02-15-preview' = {
  parent: cosmosAccount
  name: 'legends-db'
  properties: {
    resource: { id: 'legends-db' }
  }
}

// Partition key /id — one campaign per document
resource campaignsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: legendsDb
  name: 'campaigns'
  properties: {
    resource: {
      id: 'campaigns'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
    }
  }
}

resource storyStatesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: legendsDb
  name: 'story_states'
  properties: {
    resource: {
      id: 'story_states'
      partitionKey: { paths: ['/campaign_id'], kind: 'Hash' }
    }
  }
}

resource playersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: legendsDb
  name: 'players'
  properties: {
    resource: {
      id: 'players'
      partitionKey: { paths: ['/email'], kind: 'Hash' }
    }
  }
}

resource campaignPlayersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: legendsDb
  name: 'campaign_players'
  properties: {
    resource: {
      id: 'campaign_players'
      partitionKey: { paths: ['/campaign_id'], kind: 'Hash' }
    }
  }
}

resource charactersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: legendsDb
  name: 'characters'
  properties: {
    resource: {
      id: 'characters'
      partitionKey: { paths: ['/campaign_id'], kind: 'Hash' }
    }
  }
}

resource npcsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: legendsDb
  name: 'npcs'
  properties: {
    resource: {
      id: 'npcs'
      partitionKey: { paths: ['/campaign_id'], kind: 'Hash' }
    }
  }
}

output endpoint string = cosmosAccount.properties.documentEndpoint
@secure()
output connectionString string = cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
