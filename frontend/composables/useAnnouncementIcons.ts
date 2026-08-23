const globalIcons = ref<any[]>([])
let isFetched = false

export const useAnnouncementIcons = () => {
    const { getMedia, getFullUrl } = useApi()

    const fetchMediaIcons = async () => {
        try {
            const mediaList = await getMedia()
            const dynamicIcons = mediaList
                .filter(m => m.type === 'image')
                .map(m => ({
                    name: m.name,
                    label: m.name,
                    icon: '',
                    url: getFullUrl(m.url)
                }))
            globalIcons.value = dynamicIcons
            isFetched = true
        } catch (e) {
            console.error('Error fetching media icons', e)
        }
    }

    // Auto-fetch once on client if not already fetched
    if (!isFetched && typeof window !== 'undefined') {
        isFetched = true // prevent double fetch
        fetchMediaIcons()
    }

    return {
        icons: globalIcons,
        fetchMediaIcons
    }
}
