#!/bin/bash

# Script to verify package builds and import functionality
# Following the requirements in deterministic-build-plan rule

# Define colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Define log file
LOG_DIR="reports/implementation2104"
mkdir -p "$LOG_DIR"
VERIFICATION_LOG="${LOG_DIR}/package_verification.log"

echo "# ElizaOS Package Verification - $(date +"%Y-%m-%d %H:%M:%S")" > "$VERIFICATION_LOG"
echo "" >> "$VERIFICATION_LOG"

# Function to log verification results
log_verification() {
  echo "$1" | tee -a "$VERIFICATION_LOG"
}

# List of packages to verify in the correct order
PACKAGES=(
  "core"
  "adapter-sqlite"
  "dynamic-imports"
  "plugin-bootstrap"
  "clients/telegram"
  "telegram-multiagent"
  "client-direct"
  "agent"
)

# Function to check package dist files
verify_package_dist() {
  local pkg="$1"
  local pkg_path
  
  if [[ "$pkg" == *"/"* ]]; then
    # Handle nested packages like clients/telegram
    parent_dir=$(echo "$pkg" | cut -d '/' -f 1)
    child_dir=$(echo "$pkg" | cut -d '/' -f 2)
    pkg_path="packages/${parent_dir}/${child_dir}"
  else
    pkg_path="packages/${pkg}"
  fi
  
  # Check if dist directory exists
  if [ ! -d "${pkg_path}/dist" ]; then
    log_verification -e "${RED}❌ @elizaos/${pkg}: No dist directory found${NC}"
    return 1
  fi
  
  # Check if index.js exists
  if [ ! -f "${pkg_path}/dist/index.js" ]; then
    log_verification -e "${RED}❌ @elizaos/${pkg}: No index.js found in dist${NC}"
    return 1
  fi
  
  # Check if declaration files exist
  if [ ! -f "${pkg_path}/dist/index.d.ts" ]; then
    log_verification -e "${YELLOW}⚠️ @elizaos/${pkg}: No declaration files found${NC}"
    return 2
  fi
  
  log_verification -e "${GREEN}✅ @elizaos/${pkg}: Dist files verified${NC}"
  return 0
}

# Function to check package exports in package.json
verify_package_exports() {
  local pkg="$1"
  local pkg_path
  
  if [[ "$pkg" == *"/"* ]]; then
    # Handle nested packages like clients/telegram
    parent_dir=$(echo "$pkg" | cut -d '/' -f 1)
    child_dir=$(echo "$pkg" | cut -d '/' -f 2)
    pkg_path="packages/${parent_dir}/${child_dir}"
  else
    pkg_path="packages/${pkg}"
  fi
  
  # Check if package.json exists
  if [ ! -f "${pkg_path}/package.json" ]; then
    log_verification -e "${RED}❌ @elizaos/${pkg}: No package.json found${NC}"
    return 1
  fi
  
  # Check exports field
  if ! grep -q '"exports"' "${pkg_path}/package.json"; then
    log_verification -e "${YELLOW}⚠️ @elizaos/${pkg}: No exports field in package.json${NC}"
    return 2
  fi
  
  log_verification -e "${GREEN}✅ @elizaos/${pkg}: Package.json exports verified${NC}"
  return 0
}

# Main verification
log_verification "Starting package verification..."
log_verification "==================================="

# Verify each package
failed=0
warnings=0

for pkg in "${PACKAGES[@]}"; do
  log_verification -e "\nVerifying @elizaos/${pkg}..."
  
  # Check dist files
  verify_package_dist "$pkg"
  dist_status=$?
  
  # Check package.json
  verify_package_exports "$pkg"
  exports_status=$?
  
  # Track status
  if [ $dist_status -eq 1 ] || [ $exports_status -eq 1 ]; then
    ((failed++))
  elif [ $dist_status -eq 2 ] || [ $exports_status -eq 2 ]; then
    ((warnings++))
  fi
done

# Runtime import verification
log_verification -e "\nVerifying runtime imports..."
log_verification "==================================="

# ESM import test
log_verification "Testing ESM imports..."
node test-imports.mjs
if [ $? -eq 0 ]; then
  log_verification -e "${GREEN}✅ ESM import test passed${NC}"
else
  log_verification -e "${RED}❌ ESM import test failed${NC}"
  ((failed++))
fi

# CommonJS import test
log_verification "Testing CommonJS imports..."
node test-imports.cjs
if [ $? -eq 0 ]; then
  log_verification -e "${GREEN}✅ CommonJS import test passed${NC}"
else
  log_verification -e "${RED}❌ CommonJS import test failed${NC}"
  ((failed++))
fi

# Summary
log_verification -e "\nVerification Summary"
log_verification "==================================="
log_verification "Packages verified: ${#PACKAGES[@]}"
log_verification -e "Failures: ${RED}${failed}${NC}"
log_verification -e "Warnings: ${YELLOW}${warnings}${NC}"

if [ $failed -eq 0 ]; then
  log_verification -e "${GREEN}✅ All critical checks passed!${NC}"
  exit 0
else
  log_verification -e "${RED}❌ Some verifications failed. Check the log for details.${NC}"
  exit 1
fi 