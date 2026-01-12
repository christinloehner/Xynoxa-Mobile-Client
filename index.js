import { registerRootComponent } from "expo";
import { AppRegistry } from "react-native";
import App from "./App";
import { headlessAutoUpload } from "./src/headless/auto-upload";

AppRegistry.registerHeadlessTask("XynoxaAutoUpload", () => headlessAutoUpload);
registerRootComponent(App);
