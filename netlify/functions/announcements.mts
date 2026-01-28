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
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        published_at TIMESTAMP
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC)
    `;

    console.log("Announcements table created successfully!");
  } else {
    // Schema migration: ensure columns exist if table was created by older version
    try {
        await sql`
            ALTER TABLE announcements
            ADD COLUMN IF NOT EXISTS published_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'
        `;
        
        // Ensure indexes exist even if table existed
        await sql`
          CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status)
        `;

        await sql`
          CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC)
        `;
    } catch (e) {
        console.error("Error migrating announcements table:", e);
        // We don't throw here, hoping it's a transient issue or columns exist
    }
  }
}

async function getAnnouncements(status?: string) {
  await ensureTableExists();

  // If status is 'approved', we limit to the latest 5 to meet the "one to five" scrolling requirement
  // actually, let's just get all approved and let frontend filter or limit here.
  // The user said "scroll through anywhere from one to five", implying that's the desired display count.
  // I will limit to 5 active ones for the ticker.
  
  if (status === 'approved') {
     const announcements = await sql`
      SELECT id, content, status, created_at, published_at
      FROM announcements
      WHERE status = 'approved'
      ORDER BY published_at DESC, created_at DESC
      LIMIT 5
    `;
    return announcements;
  }

  if (status && status !== 'all') {
    const announcements = await sql`
      SELECT id, content, status, created_at, published_at
      FROM announcements
      WHERE status = ${status}
      ORDER BY created_at DESC
    `;
    return announcements;
  }

  // Default (all)
  const announcements = await sql`
    SELECT id, content, status, created_at, published_at
    FROM announcements
    ORDER BY created_at DESC
  `;
  return announcements;
}

async function createAnnouncement(content: string) {
  await ensureTableExists();

  const result = await sql`
    INSERT INTO announcements (content, status)
    VALUES (${content}, 'pending')
    RETURNING id, content, status, created_at
  `;
  return result[0];
}

async function approveAnnouncement(id: string) {
  await ensureTableExists();

  const result = await sql`
    UPDATE announcements
    SET status = 'approved', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}::uuid
    RETURNING id, content, status, published_at
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0];
}

async function rejectAnnouncement(id: string) {
  await ensureTableExists();

  // We can just set to rejected or delete. Let's set to rejected to keep history.
  const result = await sql`
    UPDATE announcements
    SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}::uuid
    RETURNING id, content, status
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
  const path = url.pathname;
  // Find where 'announcements' is in the path to handle both /api/... and /.netlify/functions/...
  const parts = path.split('/');
  const index = parts.lastIndexOf('announcements');
  
  let pathParts: string[] = [];
  if (index !== -1) {
      pathParts = parts.slice(index + 1);
  }
  // If 'announcements' not found (unlikely given routing), try to just take the last parts if it looks like an ID
  // But relying on the function name is safer.
  
  pathParts = pathParts.filter(Boolean);

  try {
    if (req.method === "GET") {
      const status = url.searchParams.get("status") || undefined;
      const announcements = await getAnnouncements(status);

      return new Response(JSON.stringify(announcements), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (req.method === "POST") {
      // Approve
      if (pathParts.length === 2 && pathParts[1] === "approve") {
        const id = pathParts[0];
        const result = await approveAnnouncement(id);

        if (!result) {
          return new Response(JSON.stringify({ error: "Announcement not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          message: "Announcement approved",
          announcement: result
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Reject
      if (pathParts.length === 2 && pathParts[1] === "reject") {
        const id = pathParts[0];
        const result = await rejectAnnouncement(id);

        if (!result) {
          return new Response(JSON.stringify({ error: "Announcement not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          message: "Announcement rejected",
          announcement: result
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      // Delete (Optional but good for admin)
       if (pathParts.length === 2 && pathParts[1] === "delete") {
        const id = pathParts[0];
        const result = await deleteAnnouncement(id);

        if (!result) {
          return new Response(JSON.stringify({ error: "Announcement not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          message: "Announcement deleted",
          announcement: result
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Create
      if (pathParts.length === 0) {
        const body = await req.json();

        if (!body.content) {
          return new Response(JSON.stringify({
            error: "Missing required fields: content is required"
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const announcement = await createAnnouncement(body.content);

        return new Response(JSON.stringify({
          success: true,
          message: "Announcement submitted successfully",
          announcement: announcement
        }), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    
    // Allow DELETE method for RESTfulness if desired, but using POST actions above for consistency with testimonials
    if (req.method === "DELETE") {
         if (pathParts.length === 1) {
            const id = pathParts[0];
            const result = await deleteAnnouncement(id);
             if (!result) {
                return new Response(JSON.stringify({ error: "Announcement not found" }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" }
                });
            }
             return new Response(JSON.stringify({
                success: true,
                message: "Announcement deleted"
            }), {
                status: 200,
                 headers: { "Content-Type": "application/json" }
            });
         }
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
