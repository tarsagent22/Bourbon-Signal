import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import { colors as c } from "../theme";
import {
  clusterStores,
  radiusRegion,
  type NearbyMapProps,
  type MapRegion,
} from "./map-model";
import { miles } from "../../../../shared/nearby";
export default function NearbyMap({
  origin,
  radius,
  stores,
  selected,
  onSelect,
  onSearchArea,
  bottomInset,
}: NearbyMapProps) {
  const map = useRef<MapView>(null),
    [ready, setReady] = useState(false),
    [region, setRegion] = useState<MapRegion>(
      radiusRegion(
        origin || { latitude: 39, longitude: -98 },
        origin ? radius : 1100,
      ),
    );
  useEffect(() => {
    if (ready && origin)
      map.current?.animateToRegion(radiusRegion(origin, radius), 350);
  }, [ready, origin?.latitude, origin?.longitude, radius]);
  const clusters = useMemo(
    () => clusterStores(stores, region),
    [stores, region],
  );
  const moved = origin && miles(origin, region) > Math.max(2, radius * 0.3);
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        userInterfaceStyle="dark"
        mapType="mutedStandard"
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsCompass={false}
        showsScale
        loadingEnabled
        loadingBackgroundColor={c.background}
        loadingIndicatorColor={c.accent}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        mapPadding={{ top: 135, left: 16, right: 16, bottom: bottomInset }}
        onMapReady={() => setReady(true)}
        onRegionChangeComplete={setRegion}
      >
        {origin ? (
          <Circle
            center={origin}
            radius={radius * 1609.344}
            fillColor="#D69A4A08"
            strokeColor="#D69A4A66"
            strokeWidth={1}
          />
        ) : null}
        {origin ? (
          <Marker
            coordinate={origin}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            accessible
            accessibilityLabel="Search center"
          >
            <View style={s.origin} />
          </Marker>
        ) : null}
        {clusters.map((group) => (
          <Marker
            key={`${group.id}:${group.stores.length}:${group.stores.some((s) => s.id === selected)}`}
            coordinate={group}
            tracksViewChanges={false}
            accessibilityLabel={
              group.stores.length > 1
                ? `${group.stores.length} stores. Zoom in`
                : group.stores[0].name
            }
            onPress={() => {
              if (group.stores.length === 1) onSelect(group.stores[0].id);
              else
                map.current?.animateToRegion(
                  {
                    ...group,
                    latitudeDelta: region.latitudeDelta / 2,
                    longitudeDelta: region.longitudeDelta / 2,
                  },
                  300,
                );
            }}
          >
            <View
              style={[
                s.pin,
                group.stores.some((s) => s.id === selected) && s.selected,
              ]}
            >
              <Text style={s.count}>
                {group.stores.length > 1
                  ? group.stores.length
                  : group.stores[0].signals.length}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>
      {moved ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            onSearchArea({
              latitude: region.latitude,
              longitude: region.longitude,
            })
          }
          style={s.search}
        >
          <Text style={s.searchText}>Search this area</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Recenter map"
        onPress={() => {
          if (origin)
            map.current?.animateToRegion(radiusRegion(origin, radius), 300);
        }}
        style={[s.recenter, { bottom: bottomInset + 12 }]}
      >
        <Text style={s.recenterText}>◎</Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  pin: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 9,
    backgroundColor: c.accent,
    borderWidth: 2,
    borderColor: "#F4D19E",
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: c.text, borderColor: c.accent },
  count: { color: c.background, fontSize: 14, fontWeight: "800" },
  origin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#E5D3B6",
    borderWidth: 2,
    borderColor: c.background,
  },
  search: {
    position: "absolute",
    top: 136,
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  searchText: { color: c.text, fontSize: 13, fontWeight: "600" },
  recenter: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  recenterText: { color: c.text, fontSize: 30 },
});
