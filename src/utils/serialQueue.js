/** Run async mutations in order while allowing later work after a failure. */
export function createSerialQueue() {
  let tail = Promise.resolve()
  return task => {
    const result = tail.then(task, task)
    tail = result.catch(() => {})
    return result
  }
}
