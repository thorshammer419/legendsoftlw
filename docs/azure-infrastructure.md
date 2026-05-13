# Azure Infrastructure

## Overview
All infrastructure for The Legends of TLW runs on Azure.
This document covers what needs to be provisioned and how.

## Prerequisites
- Active Azure subscription
- Azure CLI installed (`az --version`)
- Azure OpenAI access approved (submit request first — takes 24-48hrs)
- Domain legendsoftlw.app registered on Cloudflare

## Services Required

| Service | Tier | Purpose |
|---------|------|---------|
| Azure Static Web Apps | Free | React frontend hosting |
| Azure Functions | Consumption (Python) | Backend API + Durable orchestration |
| Azure Cosmos DB | Serverless | All game data storage |
| Azure AI Search | Basic | SRD RAG vector search |
| Azure SignalR Service | Free (20 connections) → Standard | Real-time narrative broadcast |
| Azure Communication Services | Pay-as-you-go | Player email notifications |
| Azure Blob Storage | LRS | Campaign novel PDF exports |
| Azure OpenAI | Pay-as-you-go | GPT-4.1 + GPT-4.1-mini |
| Azure Key Vault | Standard | Secrets management |

## Step 1: Submit Azure OpenAI Access Request
Do this FIRST — approval takes 24-48 hours.

```
https://aka.ms/oai/access
Request access to: GPT-4.1, GPT-4.1-mini
Justification: AI-powered D&D storytelling application
```

## Step 2: Create Resource Group

```bash
az login
az group create \
  --name legends-of-tlw-rg \
  --location eastus
```

## Step 3: Azure Cosmos DB

```bash
az cosmosdb create \
  --name legendsoftlw-cosmos \
  --resource-group legends-of-tlw-rg \
  --default-consistency-level Session \
  --locations regionName=eastus

az cosmosdb sql database create \
  --account-name legendsoftlw-cosmos \
  --resource-group legends-of-tlw-rg \
  --name legends-db

# Create containers
az cosmosdb sql container create \
  --account-name legendsoftlw-cosmos \
  --resource-group legends-of-tlw-rg \
  --database-name legends-db \
  --name campaigns \
  --partition-key-path /id

az cosmosdb sql container create \
  --account-name legendsoftlw-cosmos \
  --resource-group legends-of-tlw-rg \
  --database-name legends-db \
  --name story_states \
  --partition-key-path /campaign_id

az cosmosdb sql container create \
  --account-name legendsoftlw-cosmos \
  --resource-group legends-of-tlw-rg \
  --database-name legends-db \
  --name players \
  --partition-key-path /email

az cosmosdb sql container create \
  --account-name legendsoftlw-cosmos \
  --resource-group legends-of-tlw-rg \
  --database-name legends-db \
  --name campaign_players \
  --partition-key-path /campaign_id

az cosmosdb sql container create \
  --account-name legendsoftlw-cosmos \
  --resource-group legends-of-tlw-rg \
  --database-name legends-db \
  --name characters \
  --partition-key-path /campaign_id

az cosmosdb sql container create \
  --account-name legendsoftlw-cosmos \
  --resource-group legends-of-tlw-rg \
  --database-name legends-db \
  --name npcs \
  --partition-key-path /campaign_id
```

## Step 4: Azure AI Search

```bash
az search service create \
  --name legendsoftlw-search \
  --resource-group legends-of-tlw-rg \
  --sku Basic \
  --location eastus
```

Create index named `srd-index` with fields:
- id (string, key)
- content (string, searchable)
- category (string, filterable) — spell|monster|class|rule|equipment|condition
- source (string, filterable) — srd_json|srd_markdown
- tags (collection of strings, filterable)
- embedding (single vector, 1536 dimensions for text-embedding-ada-002)

## Step 5: Azure SignalR Service

```bash
az signalr create \
  --name legendsoftlw-signalr \
  --resource-group legends-of-tlw-rg \
  --sku Free_F1 \
  --service-mode Serverless
```

Note: Free tier supports 20 concurrent connections.
Upgrade to Standard_S1 when you have more than 20 players.

## Step 6: Azure Storage (Blob)

```bash
az storage account create \
  --name legendsoftlwstorage \
  --resource-group legends-of-tlw-rg \
  --location eastus \
  --sku Standard_LRS

az storage container create \
  --name novel-exports \
  --account-name legendsoftlwstorage \
  --public-access off

# scene-images is created automatically by the function on first use (public blob access)
# az storage container create --name scene-images --account-name legendsoftlwstorage --public-access blob
```

## Step 7: Azure Functions

```bash
az functionapp create \
  --name legendsoftlw-functions \
  --resource-group legends-of-tlw-rg \
  --storage-account legendsoftlwstorage \
  --consumption-plan-location eastus \
  --runtime python \
  --runtime-version 3.11 \
  --functions-version 4 \
  --os-type linux
```

## Step 8: Azure Communication Services

```bash
az communication create \
  --name legendsoftlw-comms \
  --resource-group legends-of-tlw-rg \
  --data-location unitedstates
```

After creation:
1. Add a domain for sending emails
2. Verify legendsoftlw.app domain in Cloudflare DNS
3. Add required DNS records (SPF, DKIM, DMARC) to Cloudflare

## Step 9: Azure Key Vault

```bash
az keyvault create \
  --name legendsoftlw-kv \
  --resource-group legends-of-tlw-rg \
  --location eastus
```

Store these secrets:
- COSMOS-CONNECTION-STRING
- SEARCH-API-KEY
- SIGNALR-CONNECTION-STRING
- OPENAI-API-KEY
- STORAGE-CONNECTION-STRING
- COMMS-CONNECTION-STRING

## Step 10: Azure OpenAI ✅ DONE

Two resources are required — text models and image generation are in different regions.

### Text models (Central US) ✅
- **Resource:** oai-thorshammer419-centralus (pre-existing, shared resource group)
- **Endpoint:** https://oai-thorshammer419-centralus.openai.azure.com/
- **Deployments:** tlw-gpt-4.1 (GlobalStandard), tlw-gpt-4.1-mini (GlobalStandard), tlw-text-embedding-ada-002 (Standard)

### Image generation (East US 2) ✅
gpt-image-1 (DALL-E 3's replacement) is only available in East US 2 and Sweden Central.
DALL-E 3 was deprecated March 2026 and can no longer be deployed.

```bash
az cognitiveservices account create \
  --name tlw-openai-images \
  --resource-group legends-of-tlw-rg \
  --kind OpenAI \
  --sku S0 \
  --location eastus2 \
  --custom-domain tlw-openai-images

az cognitiveservices account deployment create \
  --name tlw-openai-images \
  --resource-group legends-of-tlw-rg \
  --deployment-name tlw-gpt-image-1 \
  --model-name gpt-image-1 \
  --model-version "2025-04-15" \
  --model-format OpenAI \
  --sku-capacity 1 \
  --sku-name GlobalStandard
```

- **Endpoint:** https://tlw-openai-images.openai.azure.com/
- **Deployment:** tlw-gpt-image-1
- **API version required:** 2025-04-01-preview (not 2024-02-01)

## Step 11: Azure Static Web Apps

```bash
az staticwebapp create \
  --name legendsoftlw \
  --resource-group legends-of-tlw-rg \
  --source https://github.com/YOUR_USERNAME/legends-of-tlw \
  --location eastus2 \
  --branch main \
  --app-location /web \
  --api-location /api \
  --output-location build
```

After creation:
1. Add custom domain legendsoftlw.app
2. Configure Cloudflare DNS CNAME record
3. Enable social auth providers (Google, Facebook, Microsoft)

## Environment Variables (local.settings.json)

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "YOUR_STORAGE_CONNECTION_STRING",
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "COSMOS_CONNECTION_STRING": "YOUR_COSMOS_CONNECTION_STRING",
    "COSMOS_DATABASE_NAME": "legends-db",
    "SEARCH_ENDPOINT": "https://legendsoftlw-search.search.windows.net",
    "SEARCH_API_KEY": "YOUR_SEARCH_API_KEY",
    "SEARCH_INDEX_NAME": "srd-index",
    "SIGNALR_CONNECTION_STRING": "YOUR_SIGNALR_CONNECTION_STRING",
    "OPENAI_ENDPOINT": "https://oai-thorshammer419-centralus.openai.azure.com/",
    "OPENAI_API_KEY": "YOUR_CENTRAL_US_OPENAI_KEY",
    "OPENAI_NARRATIVE_DEPLOYMENT": "tlw-gpt-4.1",
    "OPENAI_MINI_DEPLOYMENT": "tlw-gpt-4.1-mini",
    "OPENAI_IMAGE_ENDPOINT": "https://tlw-openai-images.openai.azure.com/",
    "OPENAI_IMAGE_API_KEY": "YOUR_EAST_US2_OPENAI_KEY",
    "OPENAI_IMAGE_DEPLOYMENT": "tlw-gpt-image-1",
    "STORAGE_CONNECTION_STRING": "YOUR_STORAGE_CONNECTION_STRING",
    "COMMS_CONNECTION_STRING": "YOUR_COMMS_CONNECTION_STRING",
    "COMMS_SENDER_EMAIL": "noreply@legendsoftlw.app"
  }
}
```

## Cost Estimates (monthly, low traffic)
| Service | Estimated Cost |
|---------|---------------|
| Azure Functions (Consumption) | ~$0-5 |
| Cosmos DB (Serverless) | ~$5-15 |
| Azure AI Search (Basic) | ~$75 |
| Azure SignalR (Free) | $0 |
| Azure OpenAI (GPT-4.1) | ~$20-50 per campaign |
| Azure Communication Services | ~$1-5 |
| Azure Blob Storage | ~$1 |
| **Total** | **~$100-150/month** |

Note: Azure AI Search Basic at $75/month is the largest fixed cost.
Consider downgrading to Free tier (50MB limit) for development.
