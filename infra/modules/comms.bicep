param commsName string
param dataLocation string = 'unitedstates'

resource comms 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: commsName
  location: 'global'
  properties: {
    dataLocation: dataLocation
  }
}

@secure()
output connectionString string = comms.listKeys().primaryConnectionString
