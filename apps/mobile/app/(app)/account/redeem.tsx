import { useAuth } from "@clerk/expo";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  RewardRedemptionRequest,
  RewardShipping,
  SignalPointsSummary,
} from "../../../src/api/types";
import {
  ErrorState,
  LoadingState,
  memberScreenStyles,
} from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { useScreenRevalidation } from "../../../src/hooks/useScreenRevalidation";
import { useAccessibleStatus } from "../../../src/hooks/useAccessibleStatus";
import {
  rewardCost,
  rewardName,
  formatPoints,
} from "../../../src/rewards/reward-model";
import {
  readRewardValue,
  saveRewardValue,
} from "../../../src/rewards/reward-storage";
import {
  RewardButton,
  RewardCard,
  RewardEmblem,
  rewardStyles as s,
} from "../../../src/rewards/RewardUI";
import { colors } from "../../../src/theme";

const blank: RewardShipping = {
  recipientName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  stateCode: "",
  postalCode: "",
  phone: "",
};
export default function RedeemScreen() {
  const { item: itemKey } = useLocalSearchParams<{ item: string }>();
  const { userId } = useAuth();
  const api = useMobileApi();
  const router = useRouter();
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const [points, setPoints] = useState<SignalPointsSummary | null>(null);
  const [shipping, setShipping] = useState<RewardShipping>(blank);
  const [savedShipping, setSavedShipping] = useState<RewardShipping | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [personal, setPersonal] = useState(false);
  const [engraving, setEngraving] = useState("");
  const [confirmedAddress, setConfirmedAddress] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState<RewardRedemptionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    redemptionId: string;
    balance: number;
  } | null>(null);
  useAccessibleStatus(error || (result ? "Reward redemption received." : ""));
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const summary = await api.getSignalPoints({ fresh: true });
      const reward = summary.catalog.find(
        (candidate) => candidate.key === itemKey,
      );
      if (!reward)
        throw new Error(
          "This reward is no longer available. Return to the catalog.",
        );
      const saved = userId
        ? await readRewardValue(userId, `redemption.${itemKey}`)
        : null;
      const intent: RewardRedemptionRequest | null = saved
        ? JSON.parse(saved)
        : null;
      if (
        intent &&
        (intent.itemKey !== itemKey ||
          typeof intent.idempotencyKey !== "string" ||
          !intent.details)
      )
        throw new Error(
          "The saved redemption could not be read. Contact support before trying again.",
        );
      const address =
        reward.fulfillmentType === "physical" && summary.redemptionEligible
          ? await api.getRewardShipping()
          : null;
      if (id !== sequence.current) return;
      setPoints(summary);
      setPending(intent);
      if (intent) {
        setPersonal(intent.details.glassStyle === "personal");
        setEngraving(intent.details.engravingText || "");
        setConfirmedAddress(intent.confirmSavedAddress);
        setAgeConfirmed(intent.details.age21Attested === true);
        setReview(true);
      }
      if (address) {
        setSavedShipping(address.record);
        setShipping(
          address.record || {
            ...blank,
            recipientName: address.defaultRecipientName,
          },
        );
        setEditing(!address.record && !intent);
      }
    } catch (caught) {
      if (id === sequence.current)
        setError(
          caught instanceof Error ? caught.message : "Reward unavailable.",
        );
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, [api, itemKey, userId]);
  useScreenRevalidation(load);
  const reward = points?.catalog.find((item) => item.key === itemKey);
  const cost = reward ? rewardCost(reward, personal) : 0;
  const physical = reward?.fulfillmentType === "physical";
  const ageRequired =
    reward?.options?.requiresAge21Attestation ||
    (reward?.fulfillmentType === "digital" &&
      !reward.options?.membershipCredit);
  const engravingValid =
    !personal || /^[A-Za-z0-9][A-Za-z0-9 .,'&-]{0,17}$/.test(engraving.trim());
  const eligible =
    !!points?.redemptionEligible &&
    !!reward &&
    reward.inventoryRemaining !== 0 &&
    points.balance >= cost;
  async function saveAddress() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await api.saveRewardShipping(shipping);
      setSavedShipping(response.record);
      setShipping(response.record);
      setEditing(false);
      setConfirmedAddress(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Address could not be saved.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function redeem() {
    if (!reward || !userId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const request: RewardRedemptionRequest = pending || {
      itemKey: reward.key,
      idempotencyKey: Crypto.randomUUID(),
      confirmSavedAddress: !!physical && confirmedAddress,
      details: {
        ...(reward.options?.glassQuantity
          ? {
              glassStyle: personal
                ? ("personal" as const)
                : ("standard" as const),
              ...(personal ? { engravingText: engraving.trim() } : {}),
            }
          : {}),
        ...(ageRequired ? { age21Attested: ageConfirmed } : {}),
      },
    };
    try {
      // Persist before sending. A timeout, double tap, or restart retries the same intent.
      await saveRewardValue(
        userId,
        `redemption.${itemKey}`,
        JSON.stringify(request),
      );
      setPending(request);
      const response = await api.redeemReward(request);
      setResult(response);
      await saveRewardValue(userId, `redemption.${itemKey}`, null).catch(
        () => undefined,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The result is not confirmed. Retry this same redemption; it cannot spend points twice.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (result)
    return (
      <ScrollView
        style={memberScreenStyles.screen}
        contentContainerStyle={s.page}
      >
        <RewardCard>
          <RewardEmblem rewardKey={itemKey} />
          <Text style={s.title}>Reward requested</Text>
          <Text style={s.text}>
            Your redemption is recorded. Follow its progress in Rewards →
            Activity.
          </Text>
          <Text style={s.muted}>{result.balance} points available</Text>
          <Text selectable style={s.muted}>
            Reference: {result.redemptionId}
          </Text>
          <RewardButton
            label="View redemption status"
            onPress={() =>
              router.replace({
                pathname: "/(app)/account/rewards",
                params: { section: "activity" },
              })
            }
          />
        </RewardCard>
      </ScrollView>
    );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={memberScreenStyles.screen}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
      >
        {loading ? <LoadingState label="Preparing reward…" /> : null}
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => (pending ? void redeem() : void load())}
          />
        ) : null}
        {reward && points ? (
          <>
            <RewardCard>
              <RewardEmblem rewardKey={reward.key} />
              <Text style={s.title}>{rewardName(reward.name)}</Text>
              <Text style={s.heading}>{cost} points</Text>
              <Text style={s.muted}>
                {pending
                  ? `Current balance: ${points.balance} points. Your saved request may already be recorded.`
                  : `${formatPoints(Math.max(0, points.balance - cost))} points remaining after redemption`}
              </Text>
              {!points.redemptionEligible ? (
                <Text style={s.error}>
                  Paid membership is required to redeem.
                </Text>
              ) : null}
              {reward.inventoryRemaining === 0 ? (
                <Text style={s.error}>
                  This reward is currently unavailable.
                </Text>
              ) : null}
            </RewardCard>
            {pending ? (
              <RewardCard>
                <Text style={s.heading}>Resume your redemption</Text>
                <Text style={s.muted}>
                  A request was saved on this device. Retry it to confirm the
                  result. The same request will not spend points twice. Check
                  Activity before starting any other redemption.
                </Text>
                <RewardButton
                  label="Check redemption history"
                  secondary
                  onPress={() =>
                    router.replace({
                      pathname: "/(app)/account/rewards",
                      params: { section: "activity" },
                    })
                  }
                />
              </RewardCard>
            ) : null}
            {!pending && !review && reward.options?.glassQuantity ? (
              <RewardCard>
                <Text style={s.heading}>Make it yours</Text>
                <View style={s.spread}>
                  <Text style={[s.text, { flex: 1 }]}>
                    Personal engraving (+
                    {(reward.options.engravingPointsPerGlass || 0) *
                      reward.options.glassQuantity}{" "}
                    points)
                  </Text>
                  <Switch
                    accessibilityLabel="Personal engraving"
                    value={personal}
                    onValueChange={setPersonal}
                    trackColor={{ true: colors.accent }}
                  />
                </View>
                {personal ? (
                  <>
                    <TextInput
                      accessibilityLabel="Engraving text"
                      style={s.input}
                      value={engraving}
                      maxLength={18}
                      onChangeText={setEngraving}
                      placeholder="Up to 18 characters"
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={s.muted}>
                      Letters, numbers, spaces, and simple punctuation.
                    </Text>
                  </>
                ) : (
                  <Text style={s.muted}>Includes the Bourbon Signal mark.</Text>
                )}
              </RewardCard>
            ) : null}
            {physical ? (
              <RewardCard>
                <Text style={s.heading}>U.S. shipping address</Text>
                {editing && !review && !pending ? (
                  <>
                    {(
                      [
                        "recipientName",
                        "addressLine1",
                        "addressLine2",
                        "city",
                        "stateCode",
                        "postalCode",
                        "phone",
                      ] as const
                    ).map((key) => (
                      <View key={key} style={{ gap: 6 }}>
                        <Text style={s.muted}>
                          {
                            {
                              recipientName: "Recipient name",
                              addressLine1: "Street address",
                              addressLine2: "Apartment / suite (optional)",
                              city: "City",
                              stateCode: "State (2 letters)",
                              postalCode: "ZIP code",
                              phone: "Phone number",
                            }[key]
                          }
                        </Text>
                        <TextInput
                          accessibilityLabel={key}
                          style={s.input}
                          value={shipping[key] || ""}
                          editable={!busy}
                          autoCapitalize={
                            key === "stateCode" ? "characters" : "words"
                          }
                          keyboardType={
                            key === "phone"
                              ? "phone-pad"
                              : key === "postalCode"
                                ? "number-pad"
                                : "default"
                          }
                          maxLength={
                            key === "stateCode"
                              ? 2
                              : key === "postalCode"
                                ? 10
                                : 160
                          }
                          onChangeText={(value) =>
                            setShipping({ ...shipping, [key]: value })
                          }
                        />
                      </View>
                    ))}
                    <RewardButton
                      label={busy ? "Saving…" : "Save shipping address"}
                      disabled={busy}
                      onPress={() => void saveAddress()}
                    />
                  </>
                ) : savedShipping ? (
                  <>
                    <Text style={s.text}>
                      {savedShipping.recipientName}
                      {"\n"}
                      {savedShipping.addressLine1}
                      {savedShipping.addressLine2
                        ? `\n${savedShipping.addressLine2}`
                        : ""}
                      {"\n"}
                      {savedShipping.city}, {savedShipping.stateCode}{" "}
                      {savedShipping.postalCode}
                    </Text>
                    {!review && !pending ? (
                      <>
                        <RewardButton
                          label="Edit address"
                          secondary
                          onPress={() => {
                            setEditing(true);
                            setConfirmedAddress(false);
                          }}
                        />
                        <View style={s.row}>
                          <Switch
                            accessibilityLabel="Confirm shipping address"
                            value={confirmedAddress}
                            onValueChange={setConfirmedAddress}
                            trackColor={{ true: colors.accent }}
                          />
                          <Text style={[s.text, { flex: 1 }]}>
                            This is the address I want my reward shipped to.
                          </Text>
                        </View>
                      </>
                    ) : null}
                  </>
                ) : (
                  <Text style={s.muted}>
                    A saved shipping address is required.
                  </Text>
                )}
                <Text style={s.muted}>
                  {reward.options?.usShippingIncluded
                    ? "U.S. shipping is included. "
                    : ""}
                  Shipment status appears in Activity.
                </Text>
              </RewardCard>
            ) : (
              <RewardCard>
                <Text style={s.heading}>Digital delivery</Text>
                <Text style={s.muted}>
                  {reward.options?.membershipCredit
                    ? "Applied to an eligible directly billed membership. Apple subscriptions are not eligible."
                    : "Delivered to your verified account email after processing."}
                </Text>
                {ageRequired && !review && !pending ? (
                  <View style={s.row}>
                    <Switch
                      accessibilityLabel="I am 21 or older"
                      value={ageConfirmed}
                      onValueChange={setAgeConfirmed}
                      trackColor={{ true: colors.accent }}
                    />
                    <Text style={s.text}>I am 21 or older.</Text>
                  </View>
                ) : null}
              </RewardCard>
            )}
            {review ? (
              <RewardCard>
                <Text style={s.heading}>Review your redemption</Text>
                <Text style={s.text}>
                  {rewardName(reward.name)}
                  {personal ? `\nEngraving: ${engraving}` : ""}
                  {"\n"}Total: {cost} points
                </Text>
                <Text style={s.muted}>
                  Points are reserved when you confirm. Availability and
                  membership are checked again before the request is accepted.
                </Text>
                <RewardButton
                  label={
                    busy
                      ? "Confirming…"
                      : pending
                        ? "Retry saved redemption"
                        : `Confirm · spend ${cost} points`
                  }
                  disabled={busy || (!pending && !eligible)}
                  onPress={() => void redeem()}
                />
                {!pending ? (
                  <RewardButton
                    label="Back to details"
                    secondary
                    disabled={busy}
                    onPress={() => setReview(false)}
                  />
                ) : null}
              </RewardCard>
            ) : (
              <RewardButton
                label="Review redemption"
                disabled={
                  busy ||
                  !eligible ||
                  !engravingValid ||
                  (!!physical &&
                    (!savedShipping || !confirmedAddress || editing)) ||
                  (!!ageRequired && !ageConfirmed)
                }
                onPress={() => setReview(true)}
              />
            )}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
