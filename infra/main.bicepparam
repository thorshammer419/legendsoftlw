using './main.bicep'

// ── Required: update before deploying ─────────────────────────────────────────
param githubRepoUrl = 'https://github.com/thorshammer419/legendsoftlw'

// ── Defaults (override as needed) ─────────────────────────────────────────────
param location = 'eastus'
param appName = 'legendsoftlw'
param staticWebAppLocation = 'eastus2'
param githubBranch = 'main'

// 'free' (50 MB) during dev, 'basic' (~$75/mo) for production
param searchSku = 'basic'

// 'Free_F1' supports 20 concurrent connections
param signalrSku = 'Free_F1'
