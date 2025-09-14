import React, {useState, useEffect, useMemo} from 'react';
import {
    Modal,
    TextInput,
    Select,
    Button,
    Group,
    Stack,
    SimpleGrid,
    Card,
    Image,
    Text,
    Badge,
    ActionIcon,
    Menu,
    Skeleton,
    Notification
} from '@mantine/core';
import {DataTable, DataTableSortStatus} from 'mantine-datatable';
import {DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors} from '@dnd-kit/core';
import {arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {restrictToVerticalAxis} from '@dnd-kit/modifiers';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {
    IconSearch,
    IconSortAscending,
    IconSortDescending,
    IconPlus,
    IconUpload,
    IconDownload,
    IconTrash,
    IconCopy,
    IconEdit,
    IconPlayerPlay,
    IconGripVertical,
    IconX,
    IconDots
} from '@tabler/icons-react';
import TrackData from '../components/Playfield/TrackData';
import {Integrations} from '../editor/Integrations';
import {Serializer} from '../editor/Serializer';
import {getTrackThumb, clearThumbnailCache} from './trackThumbnails';
import {EDITOR_TO_WORLD_SCALE} from '../config/Scale';

interface TrackManagerProps {
    isOpen: boolean;
    onClose: () => void;
    actions: {
        loadTrack: (name: string) => void;
        openEditor: (trackId?: string) => void;
    };
}

interface TrackRow extends Record<string, unknown> {
    id: string;
    name: string;
    displayName: string;
    type: 'builtin' | 'custom';
    background: string;
    updatedAt?: number;
    bounds: number[][][];
    mapSize?: { width: number; height: number };
}

const CUSTOM_TRACK_ORDER_KEY = 'customTrackOrder';

function getCustomTrackOrder(): string[] {
    try {
        const stored = localStorage.getItem(CUSTOM_TRACK_ORDER_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function setCustomTrackOrder(order: string[]): void {
    try {
        localStorage.setItem(CUSTOM_TRACK_ORDER_KEY, JSON.stringify(order));
    } catch (error) {
        console.error('Failed to save custom track order:', error);
    }
}

function SortableRow({children, id, isDraggable}: { children: any; id: string; isDraggable: boolean }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({id, disabled: !isDraggable});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <tr ref={setNodeRef} style={style} {...(attributes as any)}>
            {children}
        </tr>
    );
}

export default function TrackManagerOverlay({isOpen, onClose, actions}: TrackManagerProps) {
    const [tracks, setTracks] = useState<TrackRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus>({
        columnAccessor: 'displayName',
        direction: 'asc'
    });
    const [selectedRecords, setSelectedRecords] = useState<TrackRow[]>([]);
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Load tracks data
    useEffect(() => {
        if (!isOpen) return;

        loadTracks();
    }, [isOpen]);

    // Generate thumbnails
    useEffect(() => {
        tracks.forEach(track => {
            if (!thumbnails[track.id]) {
                const cacheKey = track.updatedAt ? track.updatedAt.toString() : 'default';
                getTrackThumb(track.id, track, cacheKey).then(dataURL => {
                    setThumbnails(prev => ({...prev, [track.id]: dataURL}));
                });
            }
        });
    }, [tracks]);

    async function loadTracks() {
        setLoading(true);
        try {
            if (!TrackData.loaded) {
                await TrackData.loadFromJSON();
            }

            const customOrder = getCustomTrackOrder();
            const allTracks: TrackRow[] = [];

            // Add built-in tracks
            for (const track of TrackData.tracks) {
                if (!Integrations.isCustomTrack(track.name)) {
                    allTracks.push({
                        id: track.name,
                        name: track.name,
                        displayName: TrackData.getDisplayName(track.name),
                        type: 'builtin',
                        background: track.background,
                        bounds: track.bounds,
                        mapSize: {width: track.mapSize?.width || 5000, height: track.mapSize?.height || 4000},
                    });
                }
            }

            // Add custom tracks in order
            const customTracks: TrackRow[] = [];
            for (const track of TrackData.tracks) {
                if (Integrations.isCustomTrack(track.name)) {
                    const bundle = Integrations.getCustomTrackBundle(track.name);
                    customTracks.push({
                        id: track.name,
                        name: track.name,
                        displayName: bundle?.name || TrackData.getDisplayName(track.name),
                        type: 'custom',
                        background: track.background,
                        updatedAt: bundle?.updatedAt,
                        bounds: track.bounds,
                        mapSize: {width: track.mapSize?.width || 5000, height: track.mapSize?.height || 4000},
                    });
                }
            }

            // Sort custom tracks by order
            customTracks.sort((a, b) => {
                const aIndex = customOrder.indexOf(a.id);
                const bIndex = customOrder.indexOf(b.id);
                if (aIndex === -1 && bIndex === -1) return a.displayName.localeCompare(b.displayName);
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            });

            // Update order with any new tracks
            const newOrder = customTracks.map(t => t.id);
            if (JSON.stringify(newOrder) !== JSON.stringify(customOrder)) {
                setCustomTrackOrder(newOrder);
            }

            setTracks([...allTracks, ...customTracks]);
        } catch (error) {
            console.error('Failed to load tracks:', error);
            showNotification('error', 'Failed to load tracks');
        } finally {
            setLoading(false);
        }
    }

    function showNotification(type: 'success' | 'error', message: string) {
        setNotification({type, message});
        setTimeout(() => setNotification(null), 3000);
    }

    // Filter and sort tracks
    const filteredTracks = useMemo(() => {
        let filtered = tracks.filter(track => {
            const searchLower = search.toLowerCase();
            return (
                track.displayName.toLowerCase().includes(searchLower) ||
                track.name.toLowerCase().includes(searchLower) ||
                track.background.toLowerCase().includes(searchLower) ||
                track.type.toLowerCase().includes(searchLower)
            );
        });

        // Sort
        filtered.sort((a, b) => {
            const {columnAccessor, direction} = sortStatus;
            let aVal: any, bVal: any;

            switch (columnAccessor) {
                case 'displayName':
                    aVal = a.displayName;
                    bVal = b.displayName;
                    break;
                case 'updatedAt':
                    aVal = a.updatedAt || 0;
                    bVal = b.updatedAt || 0;
                    break;
                case 'type':
                    aVal = a.type;
                    bVal = b.type;
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [tracks, search, sortStatus]);

    // Actions
    async function handleLoad() {
        if (selectedRecords.length !== 1) return;
        const track = selectedRecords[0];
        actions.loadTrack(track.name);
        onClose();
        showNotification('success', `Loaded track: ${track.displayName}`);
    }

    async function handleRename() {
        if (selectedRecords.length !== 1 || selectedRecords[0].type !== 'custom') return;

        const track = selectedRecords[0];
        const newName = prompt('Enter new name:', track.displayName);
        if (!newName || newName.trim() === track.displayName) return;

        try {
            const bundle = Integrations.getCustomTrackBundle(track.id);
            if (!bundle) throw new Error('Track bundle not found');

            bundle.name = newName.trim();
            bundle.updatedAt = Date.now();

            Serializer.saveToLocalStorage(bundle);
            TrackData.refreshCustomTracks();
            clearThumbnailCache(track.id);

            await loadTracks();
            showNotification('success', 'Track renamed successfully');
        } catch (error) {
            console.error('Failed to rename track:', error);
            showNotification('error', 'Failed to rename track');
        }
    }

    async function handleDelete() {
        const customTracks = selectedRecords.filter(t => t.type === 'custom');
        if (customTracks.length === 0) return;

        const confirmed = confirm(`Delete ${customTracks.length} track(s)? This cannot be undone.`);
        if (!confirmed) return;

        try {
            for (const track of customTracks) {
                Serializer.deleteFromLocalStorage(track.id);
                clearThumbnailCache(track.id);
            }

            // Update custom order
            const currentOrder = getCustomTrackOrder();
            const deletedIds = customTracks.map(t => t.id);
            const newOrder = currentOrder.filter(id => !deletedIds.includes(id));
            setCustomTrackOrder(newOrder);

            TrackData.refreshCustomTracks();

            // If current session track was deleted, load default
            const currentSessionTrack = (window as any).game?.session?.trackName;
            if (currentSessionTrack && deletedIds.includes(currentSessionTrack)) {
                actions.loadTrack('bounds2');
            }

            await loadTracks();
            setSelectedRecords([]);
            showNotification('success', `Deleted ${customTracks.length} track(s)`);
        } catch (error) {
            console.error('Failed to delete tracks:', error);
            showNotification('error', 'Failed to delete tracks');
        }
    }

    async function handleDuplicate() {
        const customTracks = selectedRecords.filter(t => t.type === 'custom');
        if (customTracks.length === 0) return;

        try {
            const currentOrder = getCustomTrackOrder();
            const newIds: string[] = [];

            for (const track of customTracks) {
                const bundle = Integrations.getCustomTrackBundle(track.id);
                if (!bundle) continue;

                const newBundle = JSON.parse(JSON.stringify(bundle));
                newBundle.id = 'imported_' + Math.random().toString(36).substr(2, 9);
                newBundle.name = `Copy of ${bundle.name}`;
                newBundle.createdAt = Date.now();
                newBundle.updatedAt = Date.now();

                Serializer.saveToLocalStorage(newBundle);
                newIds.push(newBundle.id);
            }

            // Add new tracks to top of order
            setCustomTrackOrder([...newIds, ...currentOrder]);
            TrackData.refreshCustomTracks();

            await loadTracks();
            showNotification('success', `Duplicated ${customTracks.length} track(s)`);
        } catch (error) {
            console.error('Failed to duplicate tracks:', error);
            showNotification('error', 'Failed to duplicate tracks');
        }
    }

    async function handleExport() {
        if (selectedRecords.length === 0) return;

        try {
            for (const track of selectedRecords) {
                if (track.type === 'custom') {
                    const bundle = Integrations.getCustomTrackBundle(track.id);
                    if (bundle) {
                        Serializer.exportToFile(bundle);
                    }
                } else {
                    // Export built-in as bundle
                    const bundle = Serializer.createEmptyBundle();
                    bundle.name = track.displayName;
                    bundle.background = track.background;
                    bundle.mapSize = track.mapSize || {width: 5000, height: 4000};

                    // Convert bounds back to editor units
                    bundle.manualBounds = track.bounds.map(ring =>
                        ring.map(point => [point[0] / EDITOR_TO_WORLD_SCALE, point[1] / EDITOR_TO_WORLD_SCALE])
                    );

                    Serializer.exportToFile(bundle);
                }
            }
            showNotification('success', `Exported ${selectedRecords.length} track(s)`);
        } catch (error) {
            console.error('Failed to export tracks:', error);
            showNotification('error', 'Failed to export tracks');
        }
    }

    async function handleImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.multiple = true;

        input.onchange = async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (!files) return;

            try {
                const currentOrder = getCustomTrackOrder();
                const newIds: string[] = [];

                for (const file of Array.from(files)) {
                    const bundle = await Serializer.importFromFile(file);
                    Serializer.saveToLocalStorage(bundle);
                    newIds.push(bundle.id);
                }

                // Add imported tracks to top of order
                setCustomTrackOrder([...newIds, ...currentOrder]);
                TrackData.refreshCustomTracks();

                await loadTracks();
                showNotification('success', `Imported ${files.length} track(s)`);
            } catch (error) {
                console.error('Failed to import tracks:', error);
                showNotification('error', 'Failed to import tracks');
            }
        };

        input.click();
    }

    async function handleOpenInEditor() {
        if (selectedRecords.length !== 1) return;

        const track = selectedRecords[0];

        if (track.type === 'custom') {
            // Set session track and open editor
            if ((window as any).game?.session) {
                (window as any).game.session.trackName = track.id;
            }
            actions.openEditor(track.id);
            onClose();
        } else {
            // Convert built-in to custom first
            try {
                const bundle = Serializer.createEmptyBundle();
                bundle.name = `${track.displayName} (Custom)`;
                bundle.background = track.background;
                bundle.mapSize = track.mapSize || {width: 5000, height: 4000};

                // Convert bounds back to editor units
                bundle.manualBounds = track.bounds.map(ring =>
                    ring.map(point => [point[0] / EDITOR_TO_WORLD_SCALE, point[1] / EDITOR_TO_WORLD_SCALE])
                );

                Serializer.saveToLocalStorage(bundle);

                // Add to order
                const currentOrder = getCustomTrackOrder();
                setCustomTrackOrder([bundle.id, ...currentOrder]);

                TrackData.refreshCustomTracks();

                // Set session track and open editor
                if ((window as any).game?.session) {
                    (window as any).game.session.trackName = bundle.id;
                }
                actions.openEditor(bundle.id);
                onClose();

                showNotification('success', 'Converted to custom track and opened in editor');
            } catch (error) {
                console.error('Failed to convert track:', error);
                showNotification('error', 'Failed to convert track');
            }
        }
    }

    async function handleCreateNew() {
        try {
            const bundle = Serializer.createEmptyBundle();
            Serializer.saveToLocalStorage(bundle);

            // Add to top of order
            const currentOrder = getCustomTrackOrder();
            setCustomTrackOrder([bundle.id, ...currentOrder]);

            TrackData.refreshCustomTracks();

            // Set session track and open editor
            if ((window as any).game?.session) {
                (window as any).game.session.trackName = bundle.id;
            }
            actions.openEditor(bundle.id);
            onClose();

            showNotification('success', 'Created new track');
        } catch (error) {
            console.error('Failed to create new track:', error);
            showNotification('error', 'Failed to create new track');
        }
    }

    function handleDragEnd(event: any) {
        const {active, over} = event;

        if (active.id !== over.id) {
            const customTracks = filteredTracks.filter(t => t.type === 'custom');
            const oldIndex = customTracks.findIndex(t => t.id === active.id);
            const newIndex = customTracks.findIndex(t => t.id === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = arrayMove(customTracks, oldIndex, newIndex).map(t => t.id);
                setCustomTrackOrder(newOrder);

                // Update tracks state to reflect new order
                const builtinTracks = filteredTracks.filter(t => t.type === 'builtin');
                const reorderedCustom = arrayMove(customTracks, oldIndex, newIndex);
                setTracks([...builtinTracks, ...reorderedCustom]);
            }
        }
    }

    // Keyboard handling
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (!isOpen) return;

            if (e.key === 'Escape') {
                onClose();
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const canLoad = selectedRecords.length === 1;
    const canRename = selectedRecords.length === 1 && selectedRecords[0].type === 'custom';
    const canDelete = selectedRecords.some(t => t.type === 'custom');
    const canDuplicate = selectedRecords.some(t => t.type === 'custom');
    const canExport = selectedRecords.length > 0;
    const canOpenInEditor = selectedRecords.length === 1;

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title="Track Manager"
            size="xl"
            styles={{
                content: {maxWidth: '90vw', maxHeight: '90vh'},
                body: {padding: 0},
                header: {padding: '1rem'}
            }}
        >
            <Stack gap="md" style={{padding: '0 1rem 1rem'}}>
                {/* Toolbar */}
                <Group gap="sm">
                    <TextInput
                        placeholder="Search tracks..."
                        leftSection={<IconSearch size={16}/>}
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        style={{flex: 1}}
                    />

                    <Select
                        placeholder="Sort by"
                        value={`${sortStatus.columnAccessor}-${sortStatus.direction}`}
                        onChange={(value) => {
                            if (value) {
                                const [columnAccessor, direction] = value.split('-');
                                setSortStatus({columnAccessor, direction: direction as 'asc' | 'desc'});
                            }
                        }}
                        data={[
                            {value: 'displayName-asc', label: 'Name ↑'},
                            {value: 'displayName-desc', label: 'Name ↓'},
                            {value: 'updatedAt-desc', label: 'Updated ↓'},
                            {value: 'updatedAt-asc', label: 'Updated ↑'},
                            {value: 'type-asc', label: 'Type ↑'},
                            {value: 'type-desc', label: 'Type ↓'},
                        ]}
                    />
                </Group>

                {/* Action Buttons */}
                <Group gap="sm">
                    <Button leftSection={<IconPlus size={16}/>} onClick={handleCreateNew}>
                        New
                    </Button>
                    <Button leftSection={<IconUpload size={16}/>} onClick={handleImport}>
                        Import
                    </Button>
                    <Button leftSection={<IconDownload size={16}/>} disabled={!canExport} onClick={handleExport}>
                        Export
                    </Button>
                    <Button leftSection={<IconPlayerPlay size={16}/>} disabled={!canLoad} onClick={handleLoad}>
                        Load
                    </Button>
                    <Button leftSection={<IconEdit size={16}/>} disabled={!canOpenInEditor} onClick={handleOpenInEditor}>
                        Edit
                    </Button>
                    <Button leftSection={<IconEdit size={16}/>} disabled={!canRename} onClick={handleRename}>
                        Rename
                    </Button>
                    <Button leftSection={<IconCopy size={16}/>} disabled={!canDuplicate} onClick={handleDuplicate}>
                        Duplicate
                    </Button>
                    <Button leftSection={<IconTrash size={16}/>} disabled={!canDelete} onClick={handleDelete} color="red">
                        Delete
                    </Button>
                </Group>

                {/* Thumbnails Grid */}
                <SimpleGrid cols={4} spacing="sm" style={{marginBottom: '1rem'}}>
                    {filteredTracks.slice(0, 12).map(track => (
                        <Card key={track.id} padding="xs" withBorder style={{cursor: 'pointer'}}
                              onClick={() => setSelectedRecords([track])}>
                            <Card.Section>
                                {thumbnails[track.id] ? (
                                    <Image src={thumbnails[track.id]} height={120} alt={track.displayName}/>
                                ) : (
                                    <Skeleton height={120}/>
                                )}
                            </Card.Section>
                            <Text size="sm" fw={500} lineClamp={1} mt="xs">
                                {track.displayName}
                            </Text>
                            <Group gap={4} mt={4}>
                                <Badge size="xs" color={track.type === 'custom' ? 'blue' : 'gray'}>
                                    {track.type}
                                </Badge>
                                <Badge size="xs" variant="outline">
                                    {track.background}
                                </Badge>
                            </Group>
                        </Card>
                    ))}
                </SimpleGrid>

                {/* Data Table */}
                <DataTable
                    withTableBorder={true}
                    borderRadius="sm"
                    withColumnBorders
                    striped
                    highlightOnHover
                    records={filteredTracks}
                    selectedRecords={selectedRecords}
                    onSelectedRecordsChange={(records) => setSelectedRecords(records as TrackRow[])}
                    sortStatus={sortStatus}
                    onSortStatusChange={(status) => setSortStatus(status as DataTableSortStatus)}
                    columns={[
                        {
                            accessor: 'drag',
                            title: '',
                            width: 30,
                            sortable: false,
                            render: (record: TrackRow) => (
                                record.type === 'custom' ? (
                                    <ActionIcon size="sm" variant="subtle">
                                        <IconGripVertical size={16}/>
                                    </ActionIcon>
                                ) : null
                            )
                        },
                        {
                            accessor: 'thumbnail',
                            title: '',
                            width: 50,
                            sortable: false,
                            render: (record: TrackRow) => (
                                thumbnails[record.id] ? (
                                    <Image src={thumbnails[record.id]} width={40} height={30}/>
                                ) : (
                                    <Skeleton width={40} height={30}/>
                                )
                            )
                        },
                        {accessor: 'displayName', title: 'Name', sortable: true},
                        {
                            accessor: 'name',
                            title: 'ID',
                            sortable: false,
                            render: (record: TrackRow) => (
                                <span style={{fontSize: '0.8em', color: '#666'}}>{record.name}</span>
                            )
                        },
                        {
                            accessor: 'type',
                            title: 'Type',
                            sortable: true,
                            render: (record: TrackRow) => (
                                <Badge size="sm" color={record.type === 'custom' ? 'blue' : 'gray'}>
                                    {record.type}
                                </Badge>
                            )
                        },
                        {
                            accessor: 'updatedAt',
                            title: 'Updated',
                            sortable: true,
                            render: (record: TrackRow) => (
                                record.updatedAt ? new Date(record.updatedAt as number).toLocaleDateString() : '-'
                            )
                        },
                        {accessor: 'background', title: 'Background', sortable: false},
                        {
                            accessor: 'actions',
                            title: '',
                            width: 50,
                            sortable: false,
                            render: (record: TrackRow) => (
                                <Menu>
                                    <Menu.Target>
                                        <ActionIcon size="sm">
                                            <IconDots size={16}/>
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        <Menu.Item leftSection={<IconPlayerPlay size={14}/>} onClick={() => {
                                            setSelectedRecords([record]);
                                            handleLoad();
                                        }}>
                                            Load
                                        </Menu.Item>
                                        <Menu.Item leftSection={<IconEdit size={14}/>} onClick={() => {
                                            setSelectedRecords([record]);
                                            handleOpenInEditor();
                                        }}>
                                            Edit
                                        </Menu.Item>
                                        {record.type === 'custom' && (
                                            <>
                                                <Menu.Item leftSection={<IconEdit size={14}/>} onClick={() => {
                                                    setSelectedRecords([record]);
                                                    handleRename();
                                                }}>
                                                    Rename
                                                </Menu.Item>
                                                <Menu.Item leftSection={<IconCopy size={14}/>} onClick={() => {
                                                    setSelectedRecords([record]);
                                                    handleDuplicate();
                                                }}>
                                                    Duplicate
                                                </Menu.Item>
                                                <Menu.Item leftSection={<IconTrash size={14}/>} color="red" onClick={() => {
                                                    setSelectedRecords([record]);
                                                    handleDelete();
                                                }}>
                                                    Delete
                                                </Menu.Item>
                                            </>
                                        )}
                                        <Menu.Item leftSection={<IconDownload size={14}/>} onClick={() => {
                                            setSelectedRecords([record]);
                                            handleExport();
                                        }}>
                                            Export
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            )
                        },
                    ]}
                    fetching={loading}
                />
            </Stack>

            {/* Notifications */}
            {notification && (
                <Notification
                    color={notification.type === 'error' ? 'red' : 'green'}
                    onClose={() => setNotification(null)}
                    style={{
                        position: 'fixed',
                        top: 20,
                        right: 20,
                        zIndex: 1000,
                    }}
                >
                    {notification.message}
                </Notification>
            )}
        </Modal>
    );
}
