/**
 * Custom NextAuth adapter for our schema which uses Agent instead of User,
 * and agentId instead of userId on Account and Session models.
 */
import type { Adapter, AdapterAccount, AdapterUser } from "@auth/core/adapters";
import { prisma } from "@/lib/prisma";

function toAdapterUser(agent: {
  id: string;
  name: string;
  email: string;
}): AdapterUser {
  return {
    id: agent.id,
    name: agent.name,
    email: agent.email,
    emailVerified: null,
  };
}

export const agentAdapter: Adapter = {
  async createUser({ name, email }) {
    const agent = await prisma.agent.create({
      data: { name: name ?? "", email, password: null },
    });
    return toAdapterUser(agent);
  },

  async getUser(id) {
    const agent = await prisma.agent.findUnique({ where: { id } });
    return agent ? toAdapterUser(agent) : null;
  },

  async getUserByEmail(email) {
    const agent = await prisma.agent.findUnique({ where: { email } });
    return agent ? toAdapterUser(agent) : null;
  },

  async getUserByAccount({ provider, providerAccountId }) {
    const account = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { agent: true },
    });
    return account ? toAdapterUser(account.agent) : null;
  },

  async updateUser({ id, name, email }) {
    const data: { name?: string; email?: string } = {};
    if (name !== undefined && name !== null) data.name = name;
    if (email !== undefined) data.email = email;
    const agent = await prisma.agent.update({ where: { id }, data });
    return toAdapterUser(agent);
  },

  async deleteUser(id) {
    await prisma.agent.delete({ where: { id } });
  },

  async linkAccount({ userId, ...rest }: AdapterAccount) {
    await prisma.account.create({
      data: { agentId: userId, ...rest },
    });
  },

  async unlinkAccount({ provider, providerAccountId }) {
    await prisma.account.delete({
      where: { provider_providerAccountId: { provider, providerAccountId } },
    });
  },

  // Session methods below are unused with JWT strategy but required by the interface.

  async createSession({ userId, ...rest }) {
    const session = await prisma.session.create({
      data: { agentId: userId, ...rest },
    });
    const { agentId, ...sessionRest } = session;
    return { ...sessionRest, userId: agentId };
  },

  async getSessionAndUser(sessionToken) {
    const result = await prisma.session.findUnique({
      where: { sessionToken },
      include: { agent: true },
    });
    if (!result) return null;
    const { agent, agentId, ...session } = result;
    return {
      user: toAdapterUser(agent),
      session: { ...session, userId: agentId },
    };
  },

  async updateSession({ sessionToken, userId, ...rest }) {
    const data = userId
      ? { agentId: userId, ...rest }
      : rest;
    const session = await prisma.session.update({
      where: { sessionToken },
      data,
    });
    const { agentId, ...sessionRest } = session;
    return { ...sessionRest, userId: agentId };
  },

  async deleteSession(sessionToken) {
    await prisma.session.delete({ where: { sessionToken } });
  },

  async createVerificationToken(data) {
    return prisma.verificationToken.create({ data });
  },

  async useVerificationToken({ identifier, token }) {
    try {
      return await prisma.verificationToken.delete({
        where: { identifier_token: { identifier, token } },
      });
    } catch {
      return null;
    }
  },
};
