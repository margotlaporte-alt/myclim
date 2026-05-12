import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../services/firebase";

export const SITE_NEWS_COL = "siteNews";
export const SITE_SPONSORS_COL = "siteSponsors";
export const SITE_PRESS_RELEASES_COL = "sitePressReleases";
export const SITE_CONTENT_COL = "siteContent";

// ─── News ───────────────────────────────────────────────────────────────────

export function usePublishedNews(limit = 0) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(
      collection(db, SITE_NEWS_COL),
      where("status", "==", "published"),
      orderBy("publishedAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (limit > 0) items = items.slice(0, limit);
      setNews(items);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [limit]);
  return { news, loading };
}

export function useNewsArticle(slug) {
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!slug) { setLoading(false); return; }
    const q = query(
      collection(db, SITE_NEWS_COL),
      where("slug", "==", slug),
      where("status", "==", "published"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setArticle(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [slug]);
  return { article, loading };
}

export function useAllNews() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, SITE_NEWS_COL), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setNews(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);
  return { news, loading };
}

export async function saveNewsArticle(id, data) {
  const now = serverTimestamp();
  if (id) {
    await updateDoc(doc(db, SITE_NEWS_COL, id), { ...data, updatedAt: now });
    return id;
  }
  const ref = await addDoc(collection(db, SITE_NEWS_COL), { ...data, createdAt: now, updatedAt: now });
  return ref.id;
}

export async function deleteNewsArticle(id) {
  await deleteDoc(doc(db, SITE_NEWS_COL, id));
}

export function generateSlug(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ─── Sponsors ────────────────────────────────────────────────────────────────

export function useSponsors(activeOnly = true) {
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = activeOnly
      ? query(collection(db, SITE_SPONSORS_COL), where("active", "==", true))
      : collection(db, SITE_SPONSORS_COL);
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const order = ["title", "main", "institutional", "media", "supplier"];
          const ai = order.indexOf(a.category ?? "");
          const bi = order.indexOf(b.category ?? "");
          if (ai !== bi) return ai - bi;
          return (a.order ?? 99) - (b.order ?? 99);
        });
      setSponsors(items);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [activeOnly]);
  return { sponsors, loading };
}

export async function saveSponsor(id, data) {
  const now = serverTimestamp();
  if (id) {
    await updateDoc(doc(db, SITE_SPONSORS_COL, id), { ...data, updatedAt: now });
    return id;
  }
  const ref = await addDoc(collection(db, SITE_SPONSORS_COL), { ...data, createdAt: now, updatedAt: now });
  return ref.id;
}

export async function deleteSponsor(id) {
  await deleteDoc(doc(db, SITE_SPONSORS_COL, id));
}

// ─── Press releases ──────────────────────────────────────────────────────────

export function usePublishedPressReleases() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(
      collection(db, SITE_PRESS_RELEASES_COL),
      where("published", "==", true),
      orderBy("date", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setReleases(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);
  return { releases, loading };
}

export function useAllPressReleases() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, SITE_PRESS_RELEASES_COL), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setReleases(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);
  return { releases, loading };
}

export async function savePressRelease(id, data) {
  const now = serverTimestamp();
  if (id) {
    await updateDoc(doc(db, SITE_PRESS_RELEASES_COL, id), { ...data, updatedAt: now });
    return id;
  }
  const ref = await addDoc(collection(db, SITE_PRESS_RELEASES_COL), { ...data, createdAt: now, updatedAt: now });
  return ref.id;
}

export async function deletePressRelease(id) {
  await deleteDoc(doc(db, SITE_PRESS_RELEASES_COL, id));
}

// ─── Editable site content ────────────────────────────────────────────────────

export function useSiteContent(key) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, SITE_CONTENT_COL, key), (snap) => {
      setContent(snap.exists() ? (snap.data().content ?? "") : "");
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [key]);
  return { content, loading };
}

export async function setSiteContent(key, content) {
  await setDoc(doc(db, SITE_CONTENT_COL, key), { content, updatedAt: serverTimestamp() }, { merge: true });
}
