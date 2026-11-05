import { registerRootComponent } from "expo";
import Fixture from "./fixture-root";
registerRootComponent(() => <Fixture initialPath="/nearby?unlocated=1" />);
