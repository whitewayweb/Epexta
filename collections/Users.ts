import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    // Payload's relationship pickers search the title field, so it has to be a real column
    // (a virtual "name or email" field can't be queried).
    useAsTitle: "name",
    listSearchableFields: ["name", "email"],
    defaultColumns: ["name", "email", "role"],
  },
  access: {
    // Only superadmins may open the /admin panel at all. Customers (organisation
    // users who connect their own WordPress site via /connect) authenticate the same
    // way, but are blocked from the admin UI entirely.
    admin: ({ req: { user } }) => user?.role === "superadmin",
  },
  hooks: {
    beforeChange: [
      // Accounts that predate `name` have none, so the admin would title them by id. Fill
      // it from the email the next time they are saved (no backfill needed).
      ({ data, originalDoc }) => {
        const email = String(data.email ?? originalDoc?.email ?? "");
        if (!String(data.name ?? originalDoc?.name ?? "").trim() && email) data.name = email.split("@")[0];
        return data;
      },
      async ({ operation, data, req }) => {
        if (operation !== "create") return data;

        // An already-authenticated superadmin (e.g. creating a user from /admin)
        // may set the role explicitly. Anyone else (public signup via /connect)
        // can never choose their own role.
        if (req.user?.role === "superadmin") return data;

        const { totalDocs } = await req.payload.count({ collection: "users" });
        data.role = totalDocs === 0 ? "superadmin" : "customer";
        return data;
      },
    ],
  },
  fields: [
    {
      name: "name",
      label: "Full name",
      type: "text",
      // Required at signup (`signupAction`), but not by the collection: accounts that
      // predate this field have none, and a required column would block saving them
      // (and need a backfill). It is the document title, so a blank one is filled from the email on save.
      maxLength: 120,
    },
    {
      name: "role",
      type: "select",
      options: ["superadmin", "customer"],
      defaultValue: "customer",
      saveToJWT: true,
      required: true,
      access: {
        // Even a customer editing their own user doc can never change this field.
        update: ({ req }) => req.user?.role === "superadmin",
      },
      admin: {
        position: "sidebar",
      },
    },
  ],
};
