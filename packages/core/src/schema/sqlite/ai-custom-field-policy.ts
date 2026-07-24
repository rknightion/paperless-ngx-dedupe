import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const aiCustomFieldPolicy = sqliteTable(
  'ai_custom_field_policy',
  {
    fieldId: integer('field_id').primaryKey(),
    fieldName: text('field_name').notNull(),
    dataType: text('data_type').notNull(),
    guidance: text('guidance'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('ai_custom_field_policy_field_id_check', sql`${table.fieldId} > 0`),
    check('ai_custom_field_policy_name_check', sql`length(${table.fieldName}) > 0`),
    check(
      'ai_custom_field_policy_type_check',
      sql`${table.dataType} IN (
        'string', 'url', 'date', 'boolean', 'integer', 'float', 'monetary', 'select', 'longtext'
      )`,
    ),
    check(
      'ai_custom_field_policy_guidance_check',
      sql`${table.guidance} IS NULL OR length(${table.guidance}) BETWEEN 1 AND 500`,
    ),
  ],
);
