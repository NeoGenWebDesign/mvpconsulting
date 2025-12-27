import type { Context, Config } from "@netlify/functions";
import { neon } from "@netlify/neon";

const sql = neon();

async function ensureTableExists() {
  const tableExists = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'testimonials'
    )
  `;

  if (!tableExists[0]?.exists) {
    console.log("Creating testimonials table...");

    await sql`
      CREATE TABLE IF NOT EXISTS testimonials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        location VARCHAR(255),
        visa_type VARCHAR(100),
        testimonial_content TEXT NOT NULL,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        photo_url TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        published_at TIMESTAMP
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_testimonials_status ON testimonials(status)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_testimonials_created_at ON testimonials(created_at DESC)
    `;

    console.log("Testimonials table created successfully!");
  }
}

async function getTestimonials(status?: string) {
  await ensureTableExists();

  if (status && status !== 'all') {
    const testimonials = await sql`
      SELECT id, full_name, email, location, visa_type, testimonial_content,
             rating, photo_url, status, created_at, published_at
      FROM testimonials
      WHERE status = ${status}
      ORDER BY created_at DESC
    `;
    return testimonials;
  }

  const testimonials = await sql`
    SELECT id, full_name, email, location, visa_type, testimonial_content,
           rating, photo_url, status, created_at, published_at
    FROM testimonials
    ORDER BY created_at DESC
  `;
  return testimonials;
}

async function createTestimonial(data: {
  fullName: string;
  email?: string;
  location?: string;
  visaType?: string;
  testimonialContent: string;
  rating?: number;
  photoUrl?: string;
}) {
  await ensureTableExists();

  const result = await sql`
    INSERT INTO testimonials (full_name, email, location, visa_type, testimonial_content, rating, photo_url, status)
    VALUES (${data.fullName}, ${data.email || null}, ${data.location || null}, ${data.visaType || null},
            ${data.testimonialContent}, ${data.rating || null}, ${data.photoUrl || null}, 'pending')
    RETURNING id, full_name, email, location, visa_type, testimonial_content, rating, photo_url, status, created_at
  `;
  return result[0];
}

async function approveTestimonial(id: string) {
  await ensureTableExists();

  const result = await sql`
    UPDATE testimonials
    SET status = 'approved', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}::uuid
    RETURNING id, full_name, status, published_at
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0];
}

async function rejectTestimonial(id: string, reason?: string) {
  await ensureTableExists();

  const result = await sql`
    UPDATE testimonials
    SET status = 'rejected', rejection_reason = ${reason || null}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}::uuid
    RETURNING id, full_name, status, rejection_reason
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0];
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.replace(/^\/api\/testimonials\/?/, '').split('/').filter(Boolean);

  try {
    if (req.method === "GET") {
      const status = url.searchParams.get("status") || undefined;
      const testimonials = await getTestimonials(status);

      const formattedTestimonials = testimonials.map((t: Record<string, unknown>) => ({
        id: t.id,
        fullName: t.full_name,
        email: t.email,
        location: t.location,
        visaType: t.visa_type,
        testimonialContent: t.testimonial_content,
        rating: t.rating,
        photoUrl: t.photo_url,
        status: t.status,
        createdAt: t.created_at,
        publishedAt: t.published_at
      }));

      return new Response(JSON.stringify(formattedTestimonials), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (req.method === "POST") {
      if (pathParts.length === 2 && pathParts[1] === "approve") {
        const id = pathParts[0];
        const result = await approveTestimonial(id);

        if (!result) {
          return new Response(JSON.stringify({ error: "Testimonial not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          message: "Testimonial approved",
          testimonial: {
            id: result.id,
            fullName: result.full_name,
            status: result.status,
            publishedAt: result.published_at
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (pathParts.length === 2 && pathParts[1] === "reject") {
        const id = pathParts[0];
        let reason: string | undefined;

        try {
          const body = await req.json();
          reason = body.reason;
        } catch {
          // No body or invalid JSON, reason will be undefined
        }

        const result = await rejectTestimonial(id, reason);

        if (!result) {
          return new Response(JSON.stringify({ error: "Testimonial not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          message: "Testimonial rejected",
          testimonial: {
            id: result.id,
            fullName: result.full_name,
            status: result.status,
            rejectionReason: result.rejection_reason
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (pathParts.length === 0) {
        const body = await req.json();

        if (!body.fullName || !body.testimonialContent) {
          return new Response(JSON.stringify({
            error: "Missing required fields: fullName and testimonialContent are required"
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const testimonial = await createTestimonial({
          fullName: body.fullName,
          email: body.email,
          location: body.location,
          visaType: body.visaType,
          testimonialContent: body.testimonialContent,
          rating: body.rating,
          photoUrl: body.photoUrl
        });

        return new Response(JSON.stringify({
          success: true,
          message: "Testimonial submitted successfully",
          testimonial: {
            id: testimonial.id,
            fullName: testimonial.full_name,
            status: testimonial.status,
            createdAt: testimonial.created_at
          }
        }), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Testimonials API error:", error);
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
    "/api/testimonials",
    "/api/testimonials/*"
  ]
};
