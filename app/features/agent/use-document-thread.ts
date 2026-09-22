"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { validateQuestion, type AgentDocument, type AgentMessage } from "./model";

export type QuestionDraft = { content: string; page: string; quote: string };
type Thread = {
  messages: AgentMessage[];
  draft: QuestionDraft;
  editing: { id: string; draft: QuestionDraft } | null;
  loading: boolean;
  loaded: boolean;
  busy: boolean;
  loadError: string;
  error: string;
};
const blankDraft = (): QuestionDraft => ({ content: "", page: "", quote: "" });
const blankThread = (): Thread => ({ messages: [], draft: blankDraft(), editing: null, loading: true, loaded: false, busy: false, loadError: "", error: "" });

async function request<T>(documentId: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/agent`, {
    method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "暂时无法访问问题线程，请重试。");
  return data;
}

export function useDocumentThread(document: AgentDocument | null) {
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const locks = useRef(new Set<string>());
  const reads = useRef(new Map<string, number>());
  const retries = useRef(new Map<string, { signature: string; id: string }>());
  const update = useCallback((id: string, change: (thread: Thread) => Thread) => {
    setThreads((all) => ({ ...all, [id]: change(all[id] ?? blankThread()) }));
  }, []);

  const load = useCallback(async (id: string) => {
    if (locks.current.has(id)) return;
    const revision = (reads.current.get(id) ?? 0) + 1;
    reads.current.set(id, revision);
    update(id, (entry) => ({ ...entry, loading: true, loadError: "" }));
    try {
      const data = await request<{ messages: AgentMessage[] }>(id);
      if (reads.current.get(id) !== revision) return;
      update(id, (entry) => ({ ...entry, messages: data.messages, loading: false, loaded: true }));
    } catch (error) {
      if (reads.current.get(id) !== revision) return;
      update(id, (entry) => ({ ...entry, loading: false, loadError: (error as Error).message }));
    }
  }, [update]);

  const id = document?.id;
  useEffect(() => { if (id) void load(id); }, [id, load]);
  const thread = id ? threads[id] ?? blankThread() : { ...blankThread(), loading: false };

  function setDraft(patch: Partial<QuestionDraft>) {
    if (!id) return;
    update(id, (entry) => entry.editing
      ? { ...entry, error: "", editing: { ...entry.editing, draft: { ...entry.editing.draft, ...patch } } }
      : { ...entry, error: "", draft: { ...entry.draft, ...patch } });
  }

  async function mutate(operation: () => Promise<void>) {
    if (!id || locks.current.has(id) || !thread.loaded || thread.loading || thread.loadError) return;
    locks.current.add(id);
    // A pending read for this document can no longer replace mutation results.
    reads.current.set(id, (reads.current.get(id) ?? 0) + 1);
    update(id, (entry) => ({ ...entry, busy: true, error: "" }));
    try { await operation(); }
    catch (error) { update(id, (entry) => ({ ...entry, error: (error as Error).message })); }
    finally {
      locks.current.delete(id);
      update(id, (entry) => ({ ...entry, busy: false }));
    }
  }

  async function save() {
    if (!document || !id) return;
    await mutate(async () => {
      const draft = thread.editing?.draft ?? thread.draft;
      const input = validateQuestion({ content: draft.content, contextPage: draft.page.trim() ? Number(draft.page) : null, sourceQuote: draft.quote }, document.page_count);
      const signature = JSON.stringify(input);
      const previous = retries.current.get(id);
      const messageId = thread.editing?.id ?? (previous?.signature === signature ? previous.id : crypto.randomUUID());
      if (!thread.editing) retries.current.set(id, { signature, id: messageId });
      const data = await request<{ message: AgentMessage }>(id, thread.editing ? "PATCH" : "POST", { id: messageId, ...input });
      update(id, (entry) => ({
        ...entry,
        messages: entry.messages.some((item) => item.id === data.message.id)
          ? entry.messages.map((item) => item.id === data.message.id ? data.message : item)
          : [...entry.messages, data.message],
        editing: null,
        draft: thread.editing ? entry.draft : blankDraft(),
      }));
      retries.current.delete(id);
    });
  }

  async function remove(messageId: string) {
    if (!id) return;
    await mutate(async () => {
      await request(id, "DELETE", { id: messageId });
      update(id, (entry) => ({ ...entry, messages: entry.messages.filter((item) => item.id !== messageId), editing: entry.editing?.id === messageId ? null : entry.editing }));
    });
  }

  function edit(message: AgentMessage) {
    if (!id || thread.busy) return;
    update(id, (entry) => ({ ...entry, error: "", editing: { id: message.id, draft: { content: message.content, page: message.context_page?.toString() ?? "", quote: message.source_quote ?? "" } } }));
  }

  return {
    ...thread, currentDraft: thread.editing?.draft ?? thread.draft, setDraft, save, remove, edit,
    retry: () => id && load(id),
    cancelEdit: () => id && update(id, (entry) => ({ ...entry, editing: null, error: "" })),
  };
}

export type DocumentThread = ReturnType<typeof useDocumentThread>;
