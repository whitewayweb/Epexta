import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    useAPIKey: true,
  },
  admin: {
    useAsTitle: "email",
  },
  access: {
    // Only superadmins may open the /admin panel at all. Customers (tenant users
    // who connect their own WordPress site via /connect) authenticate the same
    // way, but are blocked from the admin UI entirely.
    admin: ({ req: { user } }) => user?.role === "superadmin",
  },
  hooks: {
    beforeChange: [
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
