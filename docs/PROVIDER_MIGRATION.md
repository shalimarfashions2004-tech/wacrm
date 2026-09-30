# Provider migration

The application stores normalized message intent and delivery state independently of Meta. To change provider: export templates and consent evidence, create an adapter implementing the provider contract, validate webhook signatures, map provider statuses to the internal status set, run dry-run simulations, and cut over with a small approved cohort. Keep the old adapter read-only until all pending recipients are terminal. Never duplicate-send during a cutover.
