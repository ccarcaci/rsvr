import { mock } from "bun:test"

type module_type = typeof import(".")

type module_cache_entry_type = {
  rel_path: string
  original_module: module_type
}

let modules_cache: module_cache_entry_type[] = []

const mock_module = async (rel_path: string, mock_factory: () => unknown): Promise<void> => {
  const original_module = { ...(await import(rel_path)) }
  const module_cache_entry = {
    rel_path,
    original_module,
  }
  modules_cache = [...modules_cache, module_cache_entry]
  mock.module(rel_path, mock_factory)
}

const mock_restore = () => {
  modules_cache.forEach((mce) => {
    mock.module(mce.rel_path, () => mce.original_module)
  })
  modules_cache = []
}

export { mock_module, mock_restore }
