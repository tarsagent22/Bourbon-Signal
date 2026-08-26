import { Image, type ImageSourcePropType, StyleSheet, View } from "react-native";
import { colors } from "../theme";

const BY_BOTTLE_ID: Record<string, ImageSourcePropType> = {
  "bible-old-forester-1910": require("../../assets/cellar/old-forester-1910.png"),
  "bb_317836b9e64a7620": require("../../assets/cellar/buffalo-trace.png"),
  "bible-eagle-rare-10y": require("../../assets/cellar/eagle-rare-10y.png"),
  "bible-bb_b7ca7cc4ab428ba8": require("../../assets/cellar/henry-mckenna-10y.png"),
  "bible-eh-taylor-small-batch": require("../../assets/cellar/eh-taylor-small-batch.png"),
  "bible-russells-reserve-single-barrel": require("../../assets/cellar/russells-single-barrel.png"),
  "bb_71e0a5ef723ea82c": require("../../assets/cellar/michters-us1.png"),
  "bible-woodford-reserve-double-oaked": require("../../assets/cellar/woodford-double-oaked.png"),
  "bible-russells-reserve-10": require("../../assets/cellar/russells-10y.png"),
  "bible-angels-envy-bourbon": require("../../assets/cellar/angels-envy.png"),
  "bb_7a177344b1290314": require("../../assets/cellar/jack-daniels-12y.png"),
  "bb_ef203a18f5f98f23": require("../../assets/cellar/heaven-hill-bib-7y.png"),
  "bible-wild-turkey-101": require("../../assets/cellar/wild-turkey-101.png"),
  "bible-woodford-reserve": require("../../assets/cellar/woodford-reserve.png"),
  "bible-penelope-riviera-cask-finish": require("../../assets/cellar/penelope-riviera.png"),
  "bb_9b3f8371a44671f4": require("../../assets/cellar/1792-small-batch.png"),
};

const BY_CANONICAL_KEY: Record<string, ImageSourcePropType> = {
  "1910 fine forester old": require("../../assets/cellar/old-forester-1910.png"),
  "buffalo trace": require("../../assets/cellar/buffalo-trace.png"),
  "eagle rare": require("../../assets/cellar/eagle-rare-10y.png"),
  "henry mckenna year": require("../../assets/cellar/henry-mckenna-10y.png"),
  "batch small taylor": require("../../assets/cellar/eh-taylor-small-batch.png"),
  "barrel reserve russells single": require("../../assets/cellar/russells-single-barrel.png"),
  "michter s us 1": require("../../assets/cellar/michters-us1.png"),
  "double oaked reserve woodford": require("../../assets/cellar/woodford-double-oaked.png"),
  "reserve russells year": require("../../assets/cellar/russells-10y.png"),
  "angels bourbon envy": require("../../assets/cellar/angels-envy.png"),
  "jack daniel s 12 year": require("../../assets/cellar/jack-daniels-12y.png"),
  "heaven hill bottled in bond 7 year": require("../../assets/cellar/heaven-hill-bib-7y.png"),
  "101 bourbon turkey wild": require("../../assets/cellar/wild-turkey-101.png"),
  "bourbon reserve woodford": require("../../assets/cellar/woodford-reserve.png"),
  "cask finish penelope riviera": require("../../assets/cellar/penelope-riviera.png"),
  "1792": require("../../assets/cellar/1792-small-batch.png"),
};

export function cellarSilhouetteSource(bottle: { bottleId?: string; canonicalKey?: string }) {
  return (bottle.bottleId ? BY_BOTTLE_ID[bottle.bottleId] : undefined)
    || (bottle.canonicalKey ? BY_CANONICAL_KEY[bottle.canonicalKey] : undefined)
    || null;
}

export function CellarBottleSilhouette({ bottle }: { bottle: { bottleId?: string; canonicalKey?: string; bottleName: string } }) {
  const source = cellarSilhouetteSource(bottle);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
      {source
        ? <Image resizeMode="contain" source={source} style={styles.image} />
        : <View style={styles.fallback}><View style={styles.cap} /><View style={styles.neck} /><View style={styles.body}><View style={styles.label} /></View></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 44, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surfaceRaised },
  image: { width: 38, height: 58 },
  fallback: { width: 28, height: 52, alignItems: "center", justifyContent: "flex-end" },
  cap: { width: 10, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  neck: { width: 8, height: 9, backgroundColor: colors.muted },
  body: { width: 22, height: 31, borderRadius: 6, borderColor: colors.muted, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  label: { width: 13, height: 9, borderRadius: 2, backgroundColor: colors.accent },
});
