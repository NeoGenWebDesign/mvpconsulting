import type { Context, Config } from "@netlify/functions";
import { neon } from "@netlify/neon";

const sql = neon();

async function ensureTableExists() {
  const tableExists = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'announcements'
    )
  `;

  if (!tableExists[0]?.exists) {
    console.log("Creating announcements table...");

    await sql`
      CREATE TABLE IF NOT EXISTS announcements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_announcements_is_active ON announcements(is_active)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC)
    `;

    console.log("Announcements table created successfully!");
  }
}

async function getAnnouncements(activeOnly: boolean = false) {
  await ensureTableExists();

  if (activeOnly) {
    // User requested "anywhere from one to five" announcements.
    // We'll limit to 5 latest active ones.
    const announcements = await sql`
      SELECT id, content, is_active, created_at
      FROM announcements
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 5
    `;
    return announcements;
  }

  const announcements = await sql`
    SELECT id, content, is_active, created_at
    FROM announcements
    ORDER BY created_at DESC
  `;
  return announcements;
}

async function createAnnouncement(content: string) {
  await ensureTableExists();

  const result = await sql`
    INSERT INTO announcements (content, is_active)
    VALUES (${content}, false)
    RETURNING id, content, is_active, created_at
  `;
  return result[0];
}

async function updateAnnouncement(id: string, updates: { content?: string; isActive?: boolean }) {
  await ensureTableExists();

  // Dynamically build the update query
  // Using a simpler approach: update fields if provided
  
  if (updates.content === undefined && updates.isActive === undefined) {
    return null; 
  }

  const result = await sql`
    UPDATE announcements
    SET 
      content = COALESCE(${updates.content}, content),
      is_active = COALESCE(${updates.isActive}, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}::uuid
    RETURNING id, content, is_active, created_at
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0];
}

async function deleteAnnouncement(id: string) {
  await ensureTableExists();

  const result = await sql`
    DELETE FROM announcements
    WHERE id = ${id}::uuid
    RETURNING id
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0];
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.replace(/^\/api\/announcements\/?/, '').split('/').filter(Boolean);

  try {
    // GET /api/announcements
    if (req.method === "GET") {
      const activeOnly = url.searchParams.get("active") === "true";
      const announcements = await getAnnouncements(activeOnly);

      const formatted = announcements.map((t: any) => ({
        id: t.id,
        content: t.content,
        isActive: t.is_active,
        createdAt: t.created_at
      }));

      return new Response(JSON.stringify(formatted), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // POST /api/announcements
    if (req.method === "POST") {
      const body = await req.json();

      if (!body.content) {
        return new Response(JSON.stringify({ error: "Content is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const announcement = await createAnnouncement(body.content);

      return new Response(JSON.stringify({
        success: true,
        announcement: {
          id: announcement.id,
          content: announcement.content,
          isActive: announcement.is_active,
          createdAt: announcement.created_at
        }
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }

    // PUT /api/announcements/:id
    if (req.method === "PUT") {
       if (pathParts.length !== 1) {
        return new Response(JSON.stringify({ error: "ID required" }), { status: 400 });
       }
       const id = pathParts[0];
       const body = await req.json();
       
       const updated = await updateAnnouncement(id, {
         content: body.content,
         isActive: body.isActive
       });

       if (!updated) {
         return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
       }

       return new Response(JSON.stringify({
         success: true,
         announcement: {
            id: updated.id,
            content: updated.content,
            isActive: updated.is_active,
            createdAt: updated.created_at
         }
       }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // DELETE /api/announcements/:id
    if (req.method === "DELETE") {
       if (pathParts.length !== 1) {
        return new Response(JSON.stringify({ error: "ID required" }), { status: 400 });
       }
       const id = pathParts[0];
       
       const deleted = await deleteAnnouncement(id);

       if (!deleted) {
         return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
       }

       return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Announcements API error:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config: Config = {
  path: [
    "/api/announcements",
    "/api/announcements/*"
  ]
};
