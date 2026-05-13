#!/usr/bin/env bash
# Provisions all Azure infrastructure for The Legends of TLW.
# Run once from a machine with az CLI installed and an active Azure subscription.
# Prerequisites: az login, az bicep install (or az CLI >= 2.20)

set -euo pipefail

RESOURCE_GROUP="legends-of-tlw-rg"
LOCATION="eastus"
BICEP_FILE="$(dirname "$0")/../infra/main.bicep"
PARAMS_FILE="$(dirname "$0")/../infra/main.bicepparam"
DEPLOYMENT_NAME="legends-infra-$(date +%Y%m%d-%H%M%S)"

# ── Step 0: sanity checks ──────────────────────────────────────────────────────
command -v az >/dev/null 2>&1 || { echo "Error: az CLI not found. Install from https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"; exit 1; }

echo "Checking Azure login..."
az account show --query name -o tsv || { echo "Error: Not logged in. Run 'az login' first."; exit 1; }

echo ""
echo "Subscription: $(az account show --query name -o tsv)"
echo "Resource group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo ""
read -rp "Proceed with provisioning? [y/N] " confirm
[[ "${confirm,,}" == "y" ]] || { echo "Aborted."; exit 0; }

# ── Step 1: Resource Group ─────────────────────────────────────────────────────
echo ""
echo "==> Creating resource group '$RESOURCE_GROUP' in $LOCATION..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

# ── Step 2: Bicep deployment ───────────────────────────────────────────────────
echo ""
echo "==> Running Bicep deployment '$DEPLOYMENT_NAME'..."
echo "    (This takes ~5-10 minutes for all resources to provision)"
echo ""

az deployment group create \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$BICEP_FILE" \
  --parameters "$PARAMS_FILE" \
  --output table

# ── Step 3: Show outputs ───────────────────────────────────────────────────────
echo ""
echo "==> Deployment outputs:"
az deployment group show \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.outputs \
  --output table

# ── Step 4: Create Azure AI Search index ──────────────────────────────────────
echo ""
echo "==> Next: run scripts/index_srd.py to download and index SRD content."
echo "    (Azure AI Search 'srd-index' is not created by Bicep — the Python"
echo "     script creates it with the correct vector fields.)"

# ── Step 5: Reminders ─────────────────────────────────────────────────────────
VAULT_NAME="legendsoftlw-kv"
echo ""
echo "==> Reminders:"
echo "  1. Submit Azure OpenAI access request: https://aka.ms/oai/access"
echo "     After approval, uncomment the openai module in infra/main.bicep and redeploy."
echo "     Then store the key: az keyvault secret set --vault-name $VAULT_NAME --name OPENAI-API-KEY --value <key>"
echo ""
echo "  2. Set up Azure Communication Services email domain:"
echo "     az communication email domain create ..."
echo "     Add SPF/DKIM/DMARC DNS records to Cloudflare."
echo ""
echo "  3. Add custom domain legendsoftlw.app to Static Web Apps:"
echo "     az staticwebapp hostname set --name legendsoftlw --hostname legendsoftlw.app"
echo "     Add CNAME in Cloudflare pointing to the SWA default hostname."
echo ""
echo "Done!"
