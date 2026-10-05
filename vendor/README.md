# Firebase SDK

`firebase-12.19.0.js` — Firebase JS SDK **12.19.0**, собранный в один файл (esbuild, формат IIFE, глобальная переменная `ZFirebase`).
Внутри только нужное: `firebase/app`, `firebase/auth` и облегчённый `firebase/firestore/lite`
(без слушателей реального времени — экономит лимиты и размер).

Собрано из точки входа:

```js
export { initializeApp } from 'firebase/app';
export { getAuth, GoogleAuthProvider, EmailAuthProvider, signInWithPopup, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, onAuthStateChanged,
  deleteUser, reauthenticateWithPopup, reauthenticateWithCredential, connectAuthEmulator, reload } from 'firebase/auth';
export { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  getDocs, query, orderBy, limit, serverTimestamp, increment, documentId } from 'firebase/firestore/lite';
```

Команда: `npx esbuild entry.js --bundle --format=iife --global-name=ZFirebase --minify --target=es2019 --legal-comments=eof`.
При обновлении версии поменяй имя файла и `SDK_URL` в `js/cloud.js`.
