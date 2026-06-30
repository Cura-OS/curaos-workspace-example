# audit-service §7 - Service Ports + Sidecars

| Component | Address | Protocol |
|-----------|---------|---------|
| audit-service HTTP | `:3001` | HTTP/1.1 + HTTP/2 |
| ClickHouse | `clickhouse:8123` | HTTP |
| SeaweedFS S3 | `seaweedfs:8333` | S3/HTTP |
| PostgreSQL | `postgres:5432` | PG wire |
| Kafka | `kafka:9092` | Kafka wire |
| Temporal | `temporal:7233` | gRPC |
| Valkey | `valkey:6379` | RESP3 |
| OpenBao | `openbao:8200` | HTTP |
