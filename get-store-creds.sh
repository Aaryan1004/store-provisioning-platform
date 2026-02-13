#!/bin/bash

if [ -z "$1" ]; then
  echo "❌ Usage: ./get-store-creds.sh <STORE_ID>"
  exit 1
fi

STORE_ID=$1
NAMESPACE="store-$STORE_ID"
SECRET="store-$STORE_ID-wordpress"

echo "=============================="
echo "🛒 Store Provisioning Details"
echo "=============================="
echo "📦 Namespace: $NAMESPACE"
echo "🌐 Store URL: http://store-$STORE_ID.localhost:8080"
echo "🔐 Admin URL: http://store-$STORE_ID.localhost:8080/wp-admin"
echo "👤 Username: admin"

echo -n "🔑 Password: "
kubectl get secret $SECRET -n $NAMESPACE \
  -o jsonpath="{.data.wordpress-password}" 2>/dev/null | base64 -d

if [ $? -ne 0 ]; then
  echo ""
  echo "⚠️  Secret not found. Store may still be provisioning."
fi

echo ""
echo "=============================="
