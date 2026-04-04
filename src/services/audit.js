import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export async function logAudit(factoryId, action, entity, entityId, details) {
  await addDoc(collection(db, "audit_logs"), {
    factoryId,
    action,
    entity,
    entityId,
    details,
    performedBy: auth.currentUser?.uid || null,
    performedAt: serverTimestamp(),
  });
}
