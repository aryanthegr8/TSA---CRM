-- Requires school_partnerships and all earlier parent workflow migrations.
CREATE TABLE IF NOT EXISTS boarding_school_targets (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 identity_key CHAR(64) NOT NULL,
 school_name VARCHAR(255) NOT NULL, city VARCHAR(120) NOT NULL, state VARCHAR(120) NOT NULL,
 school_owner_lead_id BIGINT UNSIGNED NULL, existing_partner_school_id BIGINT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_requested_school_identity(identity_key),
 UNIQUE KEY uq_requested_school_owner(school_owner_lead_id),
 UNIQUE KEY uq_requested_partner(existing_partner_school_id),
 FOREIGN KEY (school_owner_lead_id) REFERENCES leads(id),
 FOREIGN KEY (existing_partner_school_id) REFERENCES partner_schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS boarding_school_requests (
 lead_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, target_id BIGINT UNSIGNED NOT NULL,
 exclusive_only BOOLEAN NOT NULL DEFAULT FALSE, admission_deadline DATE NULL,
 preference_note TEXT NULL, revision INT UNSIGNED NOT NULL DEFAULT 1,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY (lead_id) REFERENCES leads(id), FOREIGN KEY (target_id) REFERENCES boarding_school_targets(id),
 FOREIGN KEY (created_by) REFERENCES crm_users(id), KEY idx_parent_school_target(target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
