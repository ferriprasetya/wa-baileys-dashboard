CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "auth_credits" (
	"session_id" varchar(50) NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "auth_credits_session_id_key_pk" PRIMARY KEY("session_id","key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(50) NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'DISCONNECTED' NOT NULL,
	"jid" varchar(50),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"api_key" text NOT NULL,
	"webhook_url" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "tenants_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;