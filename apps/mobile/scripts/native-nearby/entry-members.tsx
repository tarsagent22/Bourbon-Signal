import { registerRootComponent } from "expo";
import Fixture from "./fixture-root";
registerRootComponent(() => <Fixture initialPath="/nearby?store=fixture-board&members=1&expanded=1" />);
