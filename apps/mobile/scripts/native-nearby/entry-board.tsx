import { registerRootComponent } from "expo";
import Fixture from "./fixture-root";
registerRootComponent(() => <Fixture initialPath="/nearby?store=fixture-board&expanded=1" />);
