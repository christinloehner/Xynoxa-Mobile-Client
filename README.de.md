# Xynoxa Mobile Client

Mobile App fuer Android/iOS (Expo). Fokus:
- Dateien anzeigen und verwalten (Download, Loeschen, Kopieren, Verschieben)
- Automatischer Foto-Upload aus ausgewaehlten Alben mit Zielpfad

## Offizielle Links

Hier ist die Xynoxa‑Schaltzentrale: Webseite und alle drei Repos gebuendelt, damit du sofort die passende App findest.

- Xynoxa Webseite: https://www.xynoxa.com
- Xynoxa Cloud Anwendung: https://github.com/christinloehner/Xynoxa-Cloud
- Xynoxa Desktop Client: https://github.com/christinloehner/Xynoxa-Desktop-Client
- Xynoxa Mobile Client: https://github.com/christinloehner/Xynoxa-Mobile-Client

## ATTENTION  ATTENTION  ATTENTION  ATTENTION  ATTENTION 

Warning! This application is still under development and definitely not recommended for daily use! Currently, it is only recommended to install the application for testing purposes and not to use it in production!

**Warning! Expect data loss when testing this application!**


## Start
```
npm install
npm run start
```

## Login
Die App nutzt Login per E-Mail + Passwort. Beim ersten Login wird automatisch
ein API-Token erzeugt und lokal gespeichert.

## Auto-Upload
- Auto-Upload aktivieren
- Album aktivieren
- Zielpfad in der Cloud angeben (z.B. `Fotos/Urlaub`)
- Optional: Gruppenordner, indem der Gruppenordner-Name am Anfang steht (z.B. `Team/Fotos`)

Android: Es gibt einen nativen Hintergrund-Worker, der auch nach App-Schliessen
und nach Reboot weiterlaeuft. Das Intervall ist systembedingt (min. 15 Minuten).
iOS: Apple erlaubt keine permanenten Hintergrundprozesse; Uploads laufen ueber
systemgesteuerte Background Tasks.

## Lokaler Build (Android APK)

### Voraussetzungen
- Android Studio inkl. Android SDK + Platform Tools
- `JAVA_HOME` gesetzt (JDK 17 empfohlen fuer RN 0.74)
- `ANDROID_HOME` gesetzt (oder `ANDROID_SDK_ROOT`)
- `adb` im PATH

Falls Gradle meckert: `android/local.properties` anlegen mit dem SDK-Pfad:
```
sdk.dir=/pfad/zu/Android/Sdk
```

Wichtig fuer Builds:
- NDK Version: `25.2.9519653`
- Min SDK: `23`
Diese Werte muessen in `android/gradle.properties` stehen:
```
android.minSdkVersion=23
android.ndkVersion=25.2.9519653
```

Falls das NDK fehlt, in Android Studio ueber SDK Manager installieren
oder via sdkmanager:
```
sdkmanager "ndk;25.2.9519653"
```

### Schnellstart (Debug APK, lauffaehig ohne Keystore)
```
npm install
npx expo prebuild --platform android
cat android/gradle.properties
cd android
./gradlew assembleDebug
```
APK Pfad:
```
android/app/build/outputs/apk/debug/app-debug.apk
```
Installieren:
```
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 1) Abhaengigkeiten installieren
```
npm install
```

### 2) Native Projekte generieren
```
npx expo prebuild --platform android
```
Dadurch entsteht der `android/` Ordner mit Gradle-Projekt.

### 3) Release-Keystore erzeugen
```
keytool -genkeypair -v \
  -keystore android/app/xynoxa-release.keystore \
  -alias xynoxa \
  -keyalg RSA -keysize 2048 -validity 10000
```
Merke dir Passwort + Alias.

### 4) Keystore in Gradle eintragen
Lege `android/keystores.properties` an:
```
MYAPP_UPLOAD_STORE_FILE=xynoxa-release.keystore
MYAPP_UPLOAD_KEY_ALIAS=xynoxa
MYAPP_UPLOAD_STORE_PASSWORD=DEIN_PASSWORT
MYAPP_UPLOAD_KEY_PASSWORD=DEIN_PASSWORT
```

Passe `android/app/build.gradle` an (falls Expo es nicht schon gesetzt hat):
```
android {
  signingConfigs {
    release {
      if (project.hasProperty("MYAPP_UPLOAD_STORE_FILE")) {
        storeFile file(MYAPP_UPLOAD_STORE_FILE)
        storePassword MYAPP_UPLOAD_STORE_PASSWORD
        keyAlias MYAPP_UPLOAD_KEY_ALIAS
        keyPassword MYAPP_UPLOAD_KEY_PASSWORD
      }
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.release
    }
  }
}
```
Und in `android/gradle.properties` die Properties laden:
```
MYAPP_UPLOAD_STORE_FILE=xynoxa-release.keystore
MYAPP_UPLOAD_KEY_ALIAS=xynoxa
MYAPP_UPLOAD_STORE_PASSWORD=DEIN_PASSWORT
MYAPP_UPLOAD_KEY_PASSWORD=DEIN_PASSWORT
```

### 5) Release APK bauen
```
cd android
./gradlew assembleRelease
```
Die APK liegt dann hier:
```
android/app/build/outputs/apk/release/app-release.apk
```

### 6) APK installieren (optional)
```
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## Lokaler Build (iOS)

### Voraussetzungen
- macOS mit Xcode
- CocoaPods (`sudo gem install cocoapods`)

### Schritte
```
npm install
npx expo prebuild --platform ios
cd ios
pod install
```
Dann `ios/Xynoxa.xcworkspace` in Xcode oeffnen, Signing einstellen und Archive bauen.
