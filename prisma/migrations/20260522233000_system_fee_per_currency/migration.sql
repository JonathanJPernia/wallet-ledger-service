-- Una wallet SYSTEM_FEE por moneda (evita mezclar revenue USD/EUR, base para sharding por tenant).
CREATE UNIQUE INDEX "wallets_system_fee_currency_uidx"
  ON "wallets" ("currency")
  WHERE kind = 'SYSTEM_FEE';
