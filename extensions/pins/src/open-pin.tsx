import { useEffect, useMemo, useState } from "react";
import { Icon, LaunchProps, List, LocalStorage, getPreferenceValues } from "@raycast/api";
import { getRecentApplications, useLocalData } from "./lib/LocalData";
import { Pin, getLastOpenedPin, getPinKeywords, openPin, sortPins, usePins } from "./lib/Pins";
import { StorageKey, Visibility } from "./lib/constants";
import { ExtensionPreferences, ViewPinsPreferences } from "./lib/preferences";
import { closeRaycastToRoot, pluralize } from "./lib/utils";
import { Group, useGroups } from "./lib/Groups";
import PinListItem from "./components/PinListItem";

type Arguments = {
  query?: string;
};

const VIEW_PINS_DEFAULTS: ViewPinsPreferences = {
  showGroups: true,
  showSubtitles: true,
  showApplication: true,
  showCreationDate: false,
  showExpiration: true,
  showExecutionVisibility: true,
  showVisibility: true,
  showFragment: true,
  showFrequency: true,
  showLastOpened: true,
  showTags: true,
  showLinkCount: true,
};

const isSearchMatch = (pin: Pin, query: string) => {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
  if (terms.length === 0) return true;

  const fields = [pin.name, pin.url, pin.group, ...(pin.tags || []), ...(pin.aliases || []), ...getPinKeywords(pin)]
    .join(" ")
    .toLowerCase();

  return terms.every((term) => fields.includes(term));
};

export default function OpenPinCommand(props: LaunchProps<{ arguments: Arguments }>) {
  const initialQuery = props.arguments.query || props.fallbackText || "";
  const [searchText, setSearchText] = useState(initialQuery);
  const [autoOpened, setAutoOpened] = useState(false);
  const [selectedPinID, setSelectedPinID] = useState<string | null>(null);
  const [filteredTag, setFilteredTag] = useState<string>("all");
  const [examplesInstalled, setExamplesInstalled] = useState<boolean>(true);
  const [showingHidden, setShowingHidden] = useState<boolean>(false);
  const { pins, setPins, loadingPins, revalidatePins } = usePins();
  const { groups, loadingGroups, revalidateGroups } = useGroups();
  const { localData, loadingLocalData } = useLocalData();
  const preferences = getPreferenceValues<ExtensionPreferences & Partial<ViewPinsPreferences>>();
  const viewPreferences = {
    ...preferences,
    showGroups: preferences.showGroups ?? VIEW_PINS_DEFAULTS.showGroups,
    showSubtitles: preferences.showSubtitles ?? VIEW_PINS_DEFAULTS.showSubtitles,
    showApplication: preferences.showApplication ?? VIEW_PINS_DEFAULTS.showApplication,
    showCreationDate: preferences.showCreationDate ?? VIEW_PINS_DEFAULTS.showCreationDate,
    showExpiration: preferences.showExpiration ?? VIEW_PINS_DEFAULTS.showExpiration,
    showExecutionVisibility: preferences.showExecutionVisibility ?? VIEW_PINS_DEFAULTS.showExecutionVisibility,
    showVisibility: preferences.showVisibility ?? VIEW_PINS_DEFAULTS.showVisibility,
    showFragment: preferences.showFragment ?? VIEW_PINS_DEFAULTS.showFragment,
    showFrequency: preferences.showFrequency ?? VIEW_PINS_DEFAULTS.showFrequency,
    showLastOpened: preferences.showLastOpened ?? VIEW_PINS_DEFAULTS.showLastOpened,
    showTags: preferences.showTags ?? VIEW_PINS_DEFAULTS.showTags,
    showLinkCount: preferences.showLinkCount ?? VIEW_PINS_DEFAULTS.showLinkCount,
  } as ExtensionPreferences & ViewPinsPreferences;

  const searchedPins = useMemo(() => {
    return pins.filter((pin) => isSearchMatch(pin, searchText));
  }, [pins, searchText]);

  const visibleMatchingPins = useMemo(
    () =>
      searchedPins.filter(
        (pin) =>
          pin.visibility === undefined ||
          pin.visibility === Visibility.USE_PARENT ||
          pin.visibility === Visibility.VISIBLE ||
          pin.visibility === Visibility.VIEW_PINS_ONLY,
      ),
    [searchedPins],
  );

  const openAndCloseIfNeeded = async (pin: Pin) => {
    await getRecentApplications();
    const result = await openPin(pin, viewPreferences, localData as unknown as { [key: string]: unknown });
    if (result.didOpen && !result.openedInTerminal) {
      await closeRaycastToRoot();
    } else {
      await revalidatePins();
      await revalidateGroups();
    }
  };

  useEffect(() => {
    Promise.resolve(LocalStorage.getItem(StorageKey.EXAMPLE_PINS_INSTALLED)).then((examplesInstalled) => {
      setExamplesInstalled(examplesInstalled === 1);
    });
  }, []);

  useEffect(() => {
    if (
      autoOpened ||
      loadingPins ||
      loadingLocalData ||
      initialQuery.trim().length === 0 ||
      visibleMatchingPins.length !== 1
    ) {
      return;
    }

    setAutoOpened(true);
    Promise.resolve(openAndCloseIfNeeded(visibleMatchingPins[0]));
  }, [autoOpened, initialQuery, loadingLocalData, loadingPins, visibleMatchingPins]);

  const maxTimesOpened = Math.max(...pins.map((pin) => pin.timesOpened || 0));
  const lastOpenedPin = getLastOpenedPin(pins);

  const tagCounts = pins.reduce(
    (acc, pin) => {
      pin.tags?.forEach((tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    },
    {} as { [key: string]: number },
  );
  const tagNames = Object.keys(tagCounts);
  const pinsWithNotes = searchedPins.filter((pin) => pin.notes?.length).map((pin) => pin.id.toString());

  const getPinListItems = (sectionPins: Pin[]) => {
    const visiblePins = sectionPins.filter((pin) =>
      showingHidden
        ? true
        : pin.visibility === Visibility.USE_PARENT ||
          pin.visibility === Visibility.VISIBLE ||
          pin.visibility === Visibility.VIEW_PINS_ONLY ||
          pin.visibility === undefined,
    );

    return sortPins(sectionPins, groups)
      .filter((pin) => {
        if (showingHidden) return true;
        return (
          pin.visibility === undefined ||
          pin.visibility === Visibility.USE_PARENT ||
          pin.visibility === Visibility.VISIBLE ||
          pin.visibility === Visibility.VIEW_PINS_ONLY
        );
      })
      .map((pin, index) => (
        <PinListItem
          key={pin.id}
          index={index}
          pin={pin}
          visiblePins={visiblePins}
          pins={sectionPins}
          setPins={setPins}
          revalidatePins={revalidatePins}
          groups={groups}
          revalidateGroups={revalidateGroups}
          maxTimesOpened={maxTimesOpened}
          lastOpenedPin={lastOpenedPin}
          showingHidden={showingHidden}
          setShowingHidden={setShowingHidden}
          localData={localData}
          preferences={viewPreferences}
          examplesInstalled={examplesInstalled}
          setExamplesInstalled={setExamplesInstalled}
        />
      ));
  };

  return (
    <List
      isLoading={loadingPins || loadingGroups || loadingLocalData}
      searchBarPlaceholder="Search pins..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={{ keepSectionOrder: true }}
      onSelectionChange={(pinID) => selectedPinID != pinID && setSelectedPinID(pinID)}
      isShowingDetail={pinsWithNotes.includes(selectedPinID || "")}
      searchBarAccessory={
        tagNames.length > 0 ? (
          <List.Dropdown tooltip="Filter by Tag" isLoading={loadingPins} onChange={setFilteredTag}>
            <List.Dropdown.Item title="All Tags" value="all" icon={Icon.Tag} />
            {tagNames.map((tag) => (
              <List.Dropdown.Item
                title={`${tag} (${tagCounts[tag]} ${pluralize("pin", tagCounts[tag])})`}
                value={tag}
                icon={Icon.Tag}
                key={tag}
              />
            ))}
          </List.Dropdown>
        ) : null
      }
    >
      <List.EmptyView title="No Matching Pins" icon={Icon.MagnifyingGlass} />
      {[{ name: "None", icon: "Minus", id: -1 } as Group].concat(groups).map((group) =>
        viewPreferences.showGroups ? (
          group.visibility === Visibility.HIDDEN || group.visibility === Visibility.MENUBAR_ONLY ? (
            getPinListItems(
              searchedPins.filter(
                (pin) =>
                  (filteredTag === "all" || pin.tags?.some((tag) => tag === filteredTag)) &&
                  pin.group == group.name &&
                  pin.visibility !== Visibility.USE_PARENT &&
                  pin.visibility !== undefined,
              ),
            )
          ) : (
            <List.Section title={group.name == "None" ? "Other" : group.name} key={group.id}>
              {getPinListItems(
                searchedPins.filter(
                  (pin) =>
                    (filteredTag === "all" || pin.tags?.some((tag) => tag === filteredTag)) && pin.group == group.name,
                ),
              )}
            </List.Section>
          )
        ) : (
          getPinListItems(
            searchedPins.filter(
              (pin) =>
                (filteredTag === "all" || pin.tags?.some((tag) => tag === filteredTag)) && pin.group == group.name,
            ),
          )
        ),
      )}
    </List>
  );
}
