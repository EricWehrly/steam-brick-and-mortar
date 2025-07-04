# Test configuration for data source validation
# Using the active wehrly.com domain for development

domain_name = "wehrly.com"
route53_zone_id = "Z338L3MCT403SF"  # The active zone with more records

# Steam API key should be provided via:
# 1. Environment variable: export TF_VAR_steam_api_key="your_key"
# 2. Local terraform.tfvars file (gitignored): steam_api_key = "your_key"
# 3. Command line: terraform apply -var steam_api_key="your_key"
# steam_api_key = "set_via_environment_or_terraform.tfvars"
