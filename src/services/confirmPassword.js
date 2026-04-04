import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { auth } from "../lib/firebase";

export async function confirmOwnerPassword() {
  const password = window.prompt("Enter password to continue");

  if (!password) {
    return false;
  }

  const user = auth.currentUser;

  if (!user?.email) {
    return false;
  }

  const credential = EmailAuthProvider.credential(user.email, password);

  try {
    await reauthenticateWithCredential(user, credential);
    return true;
  } catch (error) {
    window.alert("Incorrect password");
    return false;
  }
}
