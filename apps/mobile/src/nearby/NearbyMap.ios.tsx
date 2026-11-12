import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { colors as c } from "../theme";
import {
  clusterStores,
  radiusRegion,
  type NearbyMapProps,
  type MapRegion,
} from "./map-model";
import { useReportClock } from "../hooks/useReportClock";
import { relativeSignalTime } from "../api/presentation";
import { miles, nearbySightingAge } from "../../../../shared/nearby";
export default function NearbyMap({
  origin,
  radius,
  stores,
  selected,
  sightingPins,
  onSightingPress,
  showMembers,
  onSelect,
  onSearchArea,
  bottomInset,
}: NearbyMapProps) {
  const now = useReportClock();
  const [iconsReady, setIconsReady] = useState(false);
  useEffect(() => {
    let active = true;
    void Icon.loadFont()
      .then(() => {
        if (active) setIconsReady(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
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
  const selectedLocation = stores.find((row) => row.id === selected);
  const memberPins = useMemo(
    () =>
      showMembers && selectedLocation?.kind === "board"
        ? (selectedLocation.members || []).filter(
            (m) =>
              typeof m.latitude === "number" && typeof m.longitude === "number",
          )
        : [],
    [showMembers, selectedLocation],
  );
  const framedBoard = useRef<string | null>(null);
  useEffect(() => {
    if (!showMembers) framedBoard.current = null;
    if (ready && memberPins.length && framedBoard.current !== selected) {
      framedBoard.current = selected;
      map.current?.fitToCoordinates(
        memberPins.map((m) => ({
          latitude: m.latitude!,
          longitude: m.longitude!,
        })),
        {
          edgePadding: {
            top: 150,
            left: 45,
            right: 45,
            bottom: bottomInset + 35,
          },
          animated: true,
        },
      );
    }
  }, [ready, showMembers, selected, memberPins, bottomInset]);
  const clusters = useMemo(() => {
    const groups = clusterStores(
      stores.filter((store) => store.id !== selected && store.kind !== "board"),
      region,
    );
    if (selectedLocation && selectedLocation.kind !== "board")
      groups.push({
        id: `selected-${selectedLocation.id}`,
        stores: [selectedLocation],
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
      });
    return groups;
  }, [stores, region, selected]);
  const moved = origin && miles(origin, region) > Math.max(2, radius * 0.3);
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        userInterfaceStyle="dark"
        mapType="standard"
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
        mapPadding={{ top: 112, left: 16, right: 16, bottom: bottomInset }}
        onMapReady={() => setReady(true)}
        onRegionChangeComplete={setRegion}
      >
        {origin ? (
          <Circle
            center={origin}
            radius={radius * 1609.344}
            fillColor="#00000000"
            strokeColor="#D69A4A30"
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
            key={`${group.id}:${group.stores.length}:${group.stores.some((s) => s.id === selected)}:${iconsReady}`}
            coordinate={group}
            zIndex={group.stores.some((store) => store.id === selected) ? 20 : 1}
            tracksViewChanges={!iconsReady}
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
                group.stores.length === 1 && s.singlePin,
                group.stores.some((s) => s.id === selected) && s.selected,
              ]}
            >
              {group.stores.length > 1 ? (
                <>
                  <Icon name="storefront-outline" size={13} color={c.muted} />
                  <Text style={s.count}>{group.stores.length}</Text>
                </>
              ) : (
                <Icon
                  name="storefront-outline"
                  size={17}
                  color={
                    group.stores[0].id === selected ? c.background : c.accent
                  }
                />
              )}
            </View>
          </Marker>
        ))}
        {memberPins
          .filter(
            (member) =>
              !stores.some(
                (store) =>
                  store.kind !== "board" &&
                  miles(store, {
                    latitude: member.latitude!,
                    longitude: member.longitude!,
                  }) < 0.03,
              ),
          )
          .map((member) => (
            <Marker
              key={`member-${member.id}:${iconsReady}`}
              coordinate={{
                latitude: member.latitude!,
                longitude: member.longitude!,
              }}
              tracksViewChanges={!iconsReady}
              title={member.name}
              description={`${member.address} · Receiving store unconfirmed`}
              accessibilityLabel={`${member.name}, ${member.address}. Board member store; receipt unconfirmed`}
            >
              <View
                style={[
                  s.pin,
                  {
                    backgroundColor: "#29241F",
                    borderColor: "#B9AA98",
                    borderStyle: "dashed",
                  },
                ]}
              >
                <Icon name="storefront-outline" size={16} color={c.muted} />
              </View>
            </Marker>
          ))}
        {stores
          .filter(
            (store) =>
              store.kind === "board" && !(showMembers && selected === store.id),
          )
          .map((board) => (
            <Marker
              key={`${board.id}:${selected === board.id}:${iconsReady}:${showMembers}`}
              coordinate={board}
              tracksViewChanges={!iconsReady}
              accessibilityLabel={`${board.name}. Board shipments, store availability unconfirmed`}
              onPress={() => onSelect(board.id)}
              zIndex={selected === board.id ? 10 : 2}
            >
              <View
                style={[
                  s.pin,
                  {
                    borderRadius: 10,
                    borderColor: "#C6A778",
                    backgroundColor: "#30261D",
                  },
                  selected === board.id && s.selected,
                ]}
              >
                <Icon
                  name="package-variant-closed"
                  size={18}
                  color={selected === board.id ? c.background : c.accent}
                />
              </View>
            </Marker>
          ))}
        {sightingPins?.map(pin => {
          const sighting = pin.signals.find(signal => nearbySightingAge(signal, now.getTime()));
          if (!sighting) return null;
          const age = nearbySightingAge(sighting, now.getTime());
          const label = "Seen by a member " + relativeSignalTime(sighting.timing.reportedAt || sighting.timing.displayAt, now);
          return <Marker
            key={"sighting:" + pin.id + ":" + age + ":" + iconsReady}
            coordinate={pin}
            zIndex={12}
            centerOffset={{ x: stores.some(store => store.id === pin.id) ? 26 : 0, y: 0 }}
            tracksViewChanges={!iconsReady}
            accessible
            accessibilityLabel={pin.name + ". " + label}
            title={label}
            onPress={() => onSightingPress?.(sighting.id)}
          >
            <View style={[s.pin, s.sighting, age === "older" && s.olderSighting]}>
              <Icon name="eye-outline" size={18} color={c.accent} />
            </View>
          </Marker>;
        })}
      </MapView>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "#1C1510", opacity: 0.2 },
        ]}
      />
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
          <Icon name="magnify" size={16} color={c.accent} />
          <Text style={s.searchText}>Search this area</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Recenter map"
        disabled={!origin}
        accessibilityState={{ disabled: !origin }}
        onPress={() => {
          if (origin)
            map.current?.animateToRegion(radiusRegion(origin, radius), 300);
        }}
        style={[s.recenter, { bottom: bottomInset + 12 }]}
      >
        <Icon
          name="crosshairs-gps"
          size={21}
          color={origin ? c.text : c.muted}
        />
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  pin: {
    minWidth: 32,
    height: 32,
    flexDirection: "row",
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    borderRadius: 16,
    paddingHorizontal: 9,
    backgroundColor: "#29241F",
    borderWidth: 1,
    borderColor: "#8A7C6B",
    alignItems: "center",
    justifyContent: "center",
  },
  sighting: { backgroundColor: "#30261D", borderColor: c.accent, borderRadius: 9 },
  olderSighting: { opacity: 0.58 },
  singlePin: {
    backgroundColor: "#211A13",
    borderColor: "#83715D",
    borderWidth: 1,
  },
  selected: {
    backgroundColor: c.accent,
    borderColor: "#F4D19E",
    transform: [{ scale: 1.12 }],
  },
  count: { color: c.text, fontSize: 14, fontWeight: "800" },
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
    top: 116,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
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
