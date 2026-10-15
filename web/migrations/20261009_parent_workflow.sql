-- Run against the CRM database before deploying the new workflow.
-- Requires the earlier lead-category and referral-progress migrations.
CREATE TABLE IF NOT EXISTS school_visits (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 lead_id BIGINT UNSIGNED NOT NULL,
 referral_id BIGINT UNSIGNED NOT NULL,
 scheduled_at DATETIME(3) NOT NULL,
 completed_at DATETIME(3) NULL,
 status ENUM('scheduled','completed','rescheduled','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
 contact_name VARCHAR(160) NULL,
 feedback TEXT NULL,
 recorded_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY (lead_id) REFERENCES leads(id),
 FOREIGN KEY (referral_id) REFERENCES referrals(id),
 FOREIGN KEY (recorded_by) REFERENCES crm_users(id),
 KEY idx_visits_date_status(scheduled_at,status),
 KEY idx_visits_referral(referral_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS admission_conversions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 lead_id BIGINT UNSIGNED NOT NULL,
 referral_id BIGINT UNSIGNED NOT NULL,
 student_name VARCHAR(160) NOT NULL,
 class_sought VARCHAR(40) NOT NULL,
 admission_session VARCHAR(40) NOT NULL,
 admission_date DATE NOT NULL,
 confirmed_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_conversion_lead(lead_id),
 FOREIGN KEY (lead_id) REFERENCES leads(id),
 FOREIGN KEY (referral_id) REFERENCES referrals(id),
 FOREIGN KEY (confirmed_by) REFERENCES crm_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Preserve visit records already stored by the earlier referral workflow.
INSERT INTO school_visits
 (lead_id,referral_id,scheduled_at,completed_at,status,feedback,recorded_by)
SELECT r.lead_id,r.id,COALESCE(r.visit_scheduled_at,r.visited_at),r.visited_at,
 CASE WHEN r.visited_at IS NOT NULL THEN 'completed'
      WHEN l.status IN ('lost','admitted') OR r.status='not_proceeding' THEN 'cancelled'
      ELSE 'scheduled' END,
 'Imported from existing referral visit dates',r.counsellor_id
FROM referrals r JOIN leads l ON l.id=r.lead_id
WHERE (r.visit_scheduled_at IS NOT NULL OR r.visited_at IS NOT NULL)
 AND NOT EXISTS (SELECT 1 FROM school_visits v WHERE v.referral_id=r.id);
