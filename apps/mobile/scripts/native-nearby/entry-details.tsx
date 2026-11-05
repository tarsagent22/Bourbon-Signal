import { registerRootComponent } from "expo";
import Fixture from "./fixture-root";
registerRootComponent(() => (
  <Fixture initialPath="/nearby?store=fixture-one&expanded=1" />
));
