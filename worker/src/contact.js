// ذخیرهٔ پیام‌های فرم تماس در D1.
// db همان binding از نوع D1Database است؛ اینجا فقط از واسط prepare/bind/run استفاده می‌شود
// تا بتوان در تست یک نسخهٔ ساختگی جایگزین کرد.

/**
 * @param {{prepare:(sql:string)=>{bind:(...args:unknown[])=>{run:()=>Promise<{success:boolean}>}}}} db
 * @param {{name:string,email:string,topic:string,message:string}} data
 * @returns {Promise<{id: number|null}>}
 */
export async function saveContactMessage(db, data) {
  const result = await db
    .prepare(
      'INSERT INTO contact_messages (name, email, topic, message) VALUES (?1, ?2, ?3, ?4) RETURNING id'
    )
    .bind(data.name, data.email, data.topic, data.message)
    .run();

  if (!result || result.success === false) {
    throw new Error('DB_WRITE_FAILED');
  }
  const id = result?.results?.[0]?.id ?? null;
  return { id };
}
