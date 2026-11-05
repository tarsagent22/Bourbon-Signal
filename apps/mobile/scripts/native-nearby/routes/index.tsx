import { Redirect } from "expo-router";
export default function Entry() {
  return (
    <Redirect
      href={{
        pathname: "/nearby",
        params: {
          store:
            process.env.EXPO_PUBLIC_NATIVE_NEARBY_DETAIL === "1"
              ? "fixture-one"
              : "",
        },
      }}
    />
  );
}
